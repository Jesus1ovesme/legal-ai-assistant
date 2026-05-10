import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { scrubEnv } from "@/lib/spawn-env";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createDb, schema, newUlid } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

const QuerySchema = z.object({
  folderId: z.string().regex(ULID_REGEX),
});

const PostSchema = z.object({
  folderId: z.string().regex(ULID_REGEX),
  content: z.string().min(1).max(50_000),
});

/** GET — последние N (не archived) сообщений папки. */
export async function GET(req: Request) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ folderId: url.searchParams.get("folderId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_folder_id" }, { status: 400 });
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

  const rows = await db
    .select({
      id: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.folderId, parsed.data.folderId),
        eq(schema.messages.archived, false),
      ),
    )
    .orderBy(asc(schema.messages.createdAt));

  return NextResponse.json({ messages: rows });
}

interface ClaudeStreamLine {
  type: string;
  result?: string;
  subtype?: string;
  is_error?: boolean;
}

/**
 * Вызывает `claude -p` с системным prompt'ом папки. Использует существующий login
 * Claude Code (Max-подписка) — без ANTHROPIC_API_KEY. Возвращает финальный ответ.
 */
async function callClaude(opts: {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  uploadsRoot: string;
  folderId: string;
}): Promise<{ text: string; durationMs: number; cost?: number }> {
  const start = Date.now();
  const log = logger.child({ folderId: opts.folderId });

  const historyText = opts.history
    .map((m) => `[${m.role === "user" ? "Юрист" : "Ассистент"}]\n${m.content}`)
    .join("\n\n");

  const fullPrompt = [
    opts.systemPrompt,
    historyText ? `\n\n=== История диалога ===\n${historyText}` : "",
    `\n\n=== Текущий вопрос ===\n${opts.userMessage}`,
  ]
    .filter(Boolean)
    .join("");

  // Резолвим симлинк → реальный ELF-бинарник (PM2 spawn не следует symlink из урезанного PATH).
  const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

  // Гарантируем, что cwd для Claude существует (создаётся при upload файла, но чат может
  // быть до загрузок). Без этого spawn вернёт ENOENT.
  const cwd = `${opts.uploadsRoot}/${opts.folderId}`;
  try {
    mkdirSync(cwd, { recursive: true, mode: 0o750 });
  } catch (err) {
    log.warn({ err: (err as Error).message, cwd }, "mkdir_cwd_warn");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "plan"],
      {
        cwd,
        env: scrubEnv({
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: process.env.HOME ?? "/tmp",
          // Изоляция: каждое дело — своя сессия Claude Code (свой контекст, свои логи).
          CLAUDE_PROJECT_DIR: `${opts.uploadsRoot}/${opts.folderId}`,
        }),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let resultText = "";
    let cost = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      // Парсим NDJSON по строкам.
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as ClaudeStreamLine & {
            total_cost_usd?: number;
            message?: { content?: Array<{ type: string; text?: string }> };
          };
          if (obj.type === "result" && obj.subtype === "success" && obj.result) {
            resultText = obj.result;
            cost = obj.total_cost_usd ?? 0;
          } else if (obj.type === "result" && obj.is_error) {
            log.error({ result: obj }, "claude_error_result");
          }
        } catch (err) {
          log.warn({ err, line: line.slice(0, 200) }, "claude_parse_warn");
        }
      }
    });

    // Bounded stderr — храним только последние 8KB для post-mortem.
    // Без cap'а 5-минутный поток мог раздуть строку в heap (та же проблема,
    // что закрыли в chat/stream).
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8 * 1024);
    });

    const timeoutMs = 5 * 60 * 1000;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`claude_timeout after ${timeoutMs}ms; stderr=${stderr.slice(0, 500)}`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      if (code !== 0) {
        log.error({ code, stderr: stderr.slice(0, 1000), durationMs }, "claude_exit_nonzero");
        reject(new Error(`claude exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      if (!resultText) {
        log.error({ stderr: stderr.slice(0, 1000), stdout: stdout.slice(0, 500) }, "claude_no_result");
        reject(new Error("claude returned no result"));
        return;
      }
      resolve({ text: resultText, durationMs, cost });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

/** POST — отправить новое user message, вызвать Claude, сохранить assistant ответ. */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const log = logger.child({ requestId, route: "/api/chat/messages" });

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
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [folder] = await db
    .select({
      id: schema.folders.id,
      userId: schema.folders.userId,
      systemPrompt: schema.folders.systemPrompt,
      caseType: schema.folders.caseType,
      name: schema.folders.name,
    })
    .from(schema.folders)
    .where(eq(schema.folders.id, parsed.data.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }

  // Загружаем активную историю (последние 30 сообщений).
  const history = await db
    .select({
      role: schema.messages.role,
      content: schema.messages.content,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.folderId, folder.id),
        eq(schema.messages.archived, false),
      ),
    )
    .orderBy(asc(schema.messages.createdAt));

  const turnId = randomUUID();
  const userMsgId = newUlid();
  await db.insert(schema.messages).values({
    id: userMsgId,
    folderId: folder.id,
    turnId,
    role: "user",
    content: parsed.data.content,
  });

  let assistantText: string;
  let durationMs = 0;
  let cost = 0;
  try {
    const result = await callClaude({
      systemPrompt: folder.systemPrompt,
      userMessage: parsed.data.content,
      history: history.map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: h.content,
      })),
      uploadsRoot: env.UPLOADS_ROOT,
      folderId: folder.id,
    });
    assistantText = result.text;
    durationMs = result.durationMs;
    cost = result.cost ?? 0;
  } catch (err) {
    log.error({ err: (err as Error).message }, "claude_call_failed");
    assistantText = `⚠️ Не удалось получить ответ: ${(err as Error).message}\n\nПроверь, что Claude Code залогинен на сервере (\`claude\` CLI работает с Max-подпиской).`;
  }

  const assistantMsgId = newUlid();
  await db.insert(schema.messages).values({
    id: assistantMsgId,
    folderId: folder.id,
    turnId,
    role: "assistant",
    content: assistantText,
  });

  await db.insert(schema.auditLog).values({
    action: "CHAT_SEND",
    userId: auth.userId,
    folderId: folder.id,
    turnId,
    requestId,
    latencyMs: durationMs,
    costEstimateUsd: cost > 0 ? String(cost) : null,
    payload: { user_msg_id: userMsgId, assistant_msg_id: assistantMsgId },
    ip: req.headers.get("x-forwarded-for") ?? null,
  });

  log.info({ folderId: folder.id, durationMs, cost }, "chat_send");

  return NextResponse.json({
    user: { id: userMsgId, role: "user", content: parsed.data.content, createdAt: new Date() },
    assistant: { id: assistantMsgId, role: "assistant", content: assistantText, createdAt: new Date() },
  });
}
