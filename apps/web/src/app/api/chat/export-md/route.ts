import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readdir, readFile, stat, writeFile, lstat } from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ folderId: z.string().regex(ULID_REGEX) });

interface JsonlMessage {
  type?: "user" | "assistant" | "system";
  message?: {
    role?: string;
    content?:
      | string
      | Array<{
          type?: string;
          text?: string;
          name?: string;
          input?: unknown;
          tool_use_id?: string;
          content?: unknown;
        }>;
  };
  timestamp?: string;
}

/**
 * POST /api/chat/export-md — конвертирует последнюю Claude session
 * (~/.claude/projects/<slug>/<id>.jsonl) в человекочитаемый chat-history.md
 * и кладёт в папку дела. Юрист может скачать или показать клиенту.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [folder] = await db
    .select({ userId: schema.folders.userId, name: schema.folders.name })
    .from(schema.folders)
    .where(eq(schema.folders.id, parsed.data.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }

  // Claude TUI хранит сессии в ~/.claude/projects/<sanitized-cwd>/. Slug формируется
  // самим Claude'ом заменой "/" на "-" в абсолютном пути cwd папки.
  const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
  const folderCwd = path.resolve(uploadsRoot, parsed.data.folderId);
  const claudeSlug = folderCwd.replace(/\//g, "-");
  const claudeDir = path.join(
    process.env.HOME ?? "/tmp",
    ".claude",
    "projects",
    claudeSlug,
  );

  let latestJsonl: string;
  try {
    const files = (await readdir(claudeDir))
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(claudeDir, f));
    if (files.length === 0) {
      return NextResponse.json({ error: "no_session_yet" }, { status: 404 });
    }
    const stats = await Promise.all(files.map(async (f) => ({ f, t: (await stat(f)).mtimeMs })));
    latestJsonl = stats.sort((a, b) => b.t - a.t)[0]!.f;
  } catch {
    return NextResponse.json({ error: "no_claude_session" }, { status: 404 });
  }

  const raw = await readFile(latestJsonl, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());

  const md: string[] = [
    `# Диалог с AI: ${folder.name}`,
    "",
    `_Экспортировано: ${new Date().toLocaleString("ru-RU")}_`,
    `_Источник: claude-opus-4-7 session_`,
    "",
    "---",
    "",
  ];

  for (const line of lines) {
    let msg: JsonlMessage;
    try {
      msg = JSON.parse(line) as JsonlMessage;
    } catch {
      continue;
    }
    const role = msg.message?.role ?? msg.type;
    const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleString("ru-RU") : "";
    const content = msg.message?.content;

    if (role === "user") {
      md.push(`## 👤 Юрист${ts ? ` _(${ts})_` : ""}`, "");
      if (typeof content === "string") {
        md.push(content, "");
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "text" && part.text) md.push(part.text, "");
          else if (part.type === "tool_result") {
            // Tool результаты пропускаем в экспорте — это технический шум
          }
        }
      }
    } else if (role === "assistant") {
      md.push(`## 🤖 Claude${ts ? ` _(${ts})_` : ""}`, "");
      if (typeof content === "string") {
        md.push(content, "");
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "text" && part.text) {
            md.push(part.text, "");
          } else if (part.type === "tool_use") {
            const name = part.name ?? "?";
            const inputPreview =
              typeof part.input === "object"
                ? JSON.stringify(part.input).slice(0, 200)
                : String(part.input ?? "");
            md.push(`> _Инструмент: \`${name}(${inputPreview})\`_`, "");
          } else if (part.type === "thinking" && part.text) {
            md.push(
              `<details><summary>💭 Размышления</summary>\n\n${part.text}\n\n</details>`,
              "",
            );
          }
        }
      }
    }
  }

  const folderRoot = path.resolve(env.UPLOADS_ROOT, parsed.data.folderId);
  const targetPath = path.join(folderRoot, "chat-history.md");
  // Если на месте уже symlink (например, claude.write подсунул ссылку наружу) —
  // рефьюзим. Без этого writeFile проследует по symlink и перепишет файл за
  // пределами папки.
  try {
    const st = await lstat(targetPath);
    if (st.isSymbolicLink()) {
      return NextResponse.json(
        { error: "target_is_symlink", message: "chat-history.md существует как symlink — переименуйте/удалите вручную" },
        { status: 409 },
      );
    }
  } catch {
    /* файла нет — это OK, создадим */
  }
  const finalMd = md.join("\n");
  await writeFile(targetPath, finalMd, { mode: 0o640 });

  return NextResponse.json({
    ok: true,
    path: "chat-history.md",
    sizeBytes: Buffer.byteLength(finalMd, "utf8"),
    messages: lines.length,
  });
}
