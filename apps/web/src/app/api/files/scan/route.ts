import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { registerNewFilesFromFs } from "@/server/files/register-fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ folderId: z.string().regex(ULID_REGEX) });

// Throttle: не сканируем одну папку чаще, чем раз в 4 сек.
// Polling DocumentPreview каждые 15с штатно. Throttle ловит только дубли от
// двух вкладок одновременно. ?force=1 в query — обходит throttle.
const THROTTLE_MS = 4_000;
const lastScan = new Map<string, number>();

/**
 * POST /api/files/scan — пересканирует FS папки и регистрирует в БД новые файлы
 * (которые Claude мог записать через Write tool, но БД о них не знает).
 *
 * Вызывается автоматически из DocumentPreview при первом mount + по кнопке refresh.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [folder] = await db
    .select({ userId: schema.folders.userId })
    .from(schema.folders)
    .where(eq(schema.folders.id, parsed.data.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const now = Date.now();
  const last = lastScan.get(parsed.data.folderId) ?? 0;
  if (!force && now - last < THROTTLE_MS) {
    return NextResponse.json({ ok: true, registered: 0, throttled: true });
  }
  lastScan.set(parsed.data.folderId, now);

  const registered = await registerNewFilesFromFs({
    db,
    folderId: parsed.data.folderId,
    uploadsRoot: env.UPLOADS_ROOT,
    userId: auth.userId,
    log: logger.child({ route: "/api/files/scan" }),
  });

  return NextResponse.json({ ok: true, registered });
}
