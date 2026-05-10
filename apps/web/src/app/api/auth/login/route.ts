import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createDb, schema } from "@danilurist/db";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  key: z.string().min(1).max(500),
});

// In-memory rate limit. Single-server enough. 5 неудачных попыток за 60 сек на
// IP → блок 15 мин. Cleanup старых записей при росте >1000.
interface AttemptRecord {
  failures: number[];
  blockedUntil: number;
}
const ATTEMPTS = new Map<string, AttemptRecord>();
const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 5;
const BLOCK_DURATION_MS = 15 * 60_000;

function getClientIp(req: NextRequest): string {
  // Доверяем XFF только если запрос пришёл через локальный прокси (nginx 127.0.0.1).
  // Если web когда-нибудь окажется exposed напрямую — XFF можно спуфить, и злоумышленник
  // обходит rate-limit чередуя заголовок. NextRequest не отдаёт remoteAddress; берём
  // из проксированного x-real-ip (nginx ставит его доверенно), либо из XFF только
  // в production (когда мы знаем что фронт — это nginx).
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function checkBlocked(ip: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = ATTEMPTS.get(ip);
  if (rec && rec.blockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((rec.blockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const rec = ATTEMPTS.get(ip) ?? { failures: [], blockedUntil: 0 };
  rec.failures = rec.failures.filter((t) => now - t < FAIL_WINDOW_MS);
  rec.failures.push(now);
  if (rec.failures.length >= FAIL_LIMIT) {
    rec.blockedUntil = now + BLOCK_DURATION_MS;
    rec.failures = [];
  }
  ATTEMPTS.set(ip, rec);
  if (ATTEMPTS.size > 1000) {
    for (const [k, v] of ATTEMPTS) {
      if (v.blockedUntil < now && v.failures.length === 0) ATTEMPTS.delete(k);
    }
  }
}

function clearAttempts(ip: string): void {
  ATTEMPTS.delete(ip);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * POST /api/auth/login — вход по секретному ключу.
 * Body: { key: string }. Сравнение через timingSafeEqual.
 * При успехе — выставляет iron-session cookie на 14 дней.
 */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const ip = getClientIp(req);
  const log = logger.child({ requestId, route: "/api/auth/login", ip });

  // Rate-limit check: если IP заблочен — 429 без проверки ключа
  const block = checkBlocked(ip);
  if (block.blocked) {
    log.warn({ retryAfterSec: block.retryAfterSec }, "login_rate_limited");
    return NextResponse.json(
      {
        error: "too_many_attempts",
        retryAfter: block.retryAfterSec,
        message: `Слишком много неудачных попыток. Попробуйте через ${Math.ceil(block.retryAfterSec / 60)} мин.`,
      },
      { status: 429, headers: { "retry-after": String(block.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const env = getEnv();
  if (!safeEqual(parsed.data.key, env.APP_ACCESS_KEY)) {
    recordFailure(ip);
    log.warn("login_failed");
    const db = createDb({ connectionString: env.DATABASE_URL });
    await db.insert(schema.auditLog).values({
      action: "LOGIN_FAIL",
      requestId,
      ip,
    });
    return NextResponse.json({ error: "invalid_key" }, { status: 401 });
  }

  // Успешный вход — сбрасываем счётчик failures
  clearAttempts(ip);

  // Возвращаем существующего bootstrap-юзера (на MVP single-user).
  const db = createDb({ connectionString: env.DATABASE_URL });
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .limit(1);
  if (!user) {
    log.error("no_bootstrap_user");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.issuedAt = Date.now();
  await session.save();

  // schema.sessions table раньше получал INSERT, но никогда не читался — это
  // dead audit metadata, дублирующее audit_log. Убрано (YAGNI). Если когда-то
  // понадобится server-side session revocation — это будет другой механизм.

  const userAgent = req.headers.get("user-agent");
  await db.insert(schema.auditLog).values({
    action: "LOGIN_OK",
    userId: user.id,
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? null,
    payload: userAgent ? { userAgent } : null,
  });

  log.info({ userId: user.id }, "login_ok");
  return NextResponse.json({ ok: true });
}
