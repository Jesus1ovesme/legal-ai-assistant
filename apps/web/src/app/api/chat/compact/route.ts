import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { scrubEnv } from "@/lib/spawn-env";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createDb, schema, newUlid } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const QuerySchema = z.object({ folderId: z.string().regex(ULID_REGEX) });

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

async function summarize(messages: Array<{ role: string; content: string }>): Promise<string> {
  const dialog = messages
    .map((m) => `[${m.role === "user" ? "Юрист" : m.role === "assistant" ? "Ассистент" : m.role}]\n${m.content}`)
    .join("\n\n");

  const prompt = `Сожми этот диалог юриста с AI-ассистентом в краткий summary до 500 слов. Сохрани:
- ключевые факты дела (стороны, даты, документы, цифры)
- принятые решения и юридические выводы ассистента
- найденные источники (НПА, судпрактика) с URL
- открытые вопросы, требующие дальнейшей проработки

Формат: краткие пункты без воды. Не повторяй одно и то же.

=== Диалог ===
${dialog}

=== Summary ===`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--output-format", "json", "--model", "claude-haiku-4-5-20251001"],
      {
        env: scrubEnv({
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: process.env.HOME ?? "/tmp",
        }),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    // Caps: compact возвращает один JSON ~до 50KB; ставим 2MB запас.
    // stderr — последние 8KB.
    const MAX_STDOUT = 2 * 1024 * 1024;
    let stdoutTruncated = false;
    child.stdout.on("data", (c) => {
      if (stdoutTruncated) return;
      const chunk = c.toString("utf8");
      if (stdout.length + chunk.length > MAX_STDOUT) {
        stdoutTruncated = true;
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (c) => {
      stderr = (stderr + c.toString("utf8")).slice(-8 * 1024);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`compact_timeout: ${stderr.slice(0, 300)}`));
    }, 60_000);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`claude exit ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        const obj = JSON.parse(stdout) as { result?: string };
        resolve(obj.result ?? "(не удалось получить summary)");
      } catch (err) {
        reject(new Error(`parse failed: ${(err as Error).message}`));
      }
    });
    child.on("error", reject);
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

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

  const messages = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.folderId, parsed.data.folderId),
        eq(schema.messages.archived, false),
      ),
    )
    .orderBy(asc(schema.messages.createdAt));

  if (messages.length < 4) {
    return NextResponse.json(
      { error: "too_few_messages", message: "Сжимать пока нечего — меньше 4 сообщений." },
      { status: 400 },
    );
  }

  let summary: string;
  try {
    summary = await summarize(messages);
  } catch (err) {
    return NextResponse.json({ error: "compact_failed", message: (err as Error).message }, { status: 500 });
  }

  // Архивируем существующие, добавляем system message с summary в новой turn'е.
  const turnId = randomUUID();
  await db
    .update(schema.messages)
    .set({ archived: true })
    .where(
      and(
        eq(schema.messages.folderId, parsed.data.folderId),
        eq(schema.messages.archived, false),
      ),
    );
  const summaryMsgId = newUlid();
  await db.insert(schema.messages).values({
    id: summaryMsgId,
    folderId: parsed.data.folderId,
    turnId,
    role: "system",
    content: `📦 **Summary предыдущего диалога** (сжато ${messages.length} сообщений):\n\n${summary}`,
  });

  await db.insert(schema.auditLog).values({
    action: "CHAT_COMPACT",
    userId: auth.userId,
    folderId: parsed.data.folderId,
    turnId,
    payload: { archivedCount: messages.length, summaryMsgId },
  });

  return NextResponse.json({ ok: true, archivedCount: messages.length, summaryMsgId });
}
