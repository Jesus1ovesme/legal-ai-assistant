import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@legal-ai-assistant/db";
import { ULID_REGEX } from "@legal-ai-assistant/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const HTML_HEAD = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Предпросмотр</title>
<style>
  :root { color-scheme: light; }
  body {
    font-family: "Source Serif Pro", "Charter", Georgia, serif;
    max-width: 780px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    line-height: 1.65;
    color: #1a1a1a;
    background: #faf9f5;
  }
  h1, h2, h3, h4 { font-family: "Inter", sans-serif; letter-spacing: -0.01em; }
  h1 { font-size: 1.6rem; margin-top: 2rem; }
  h2 { font-size: 1.3rem; margin-top: 1.6rem; }
  h3 { font-size: 1.1rem; margin-top: 1.3rem; }
  p { margin: 0.6rem 0; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #e0dccd; padding: 0.4rem 0.6rem; }
  th { background: #f0eee6; }
  blockquote { border-left: 3px solid #c96442; padding-left: 1rem; color: #555; }
  code, pre { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.9em; background: #f0eee6; padding: 0.1rem 0.3rem; border-radius: 4px; }
  img { max-width: 100%; height: auto; }
  a { color: #c96442; }
</style>
</head>
<body>`;

const HTML_TAIL = `</body></html>`;

/**
 * GET /api/files/[id]/preview — отдаёт inline-HTML для просмотра .docx прямо
 * в браузере (без скачивания). Конвертация через mammoth → HTML.
 *
 * Для .md/.txt просто отдаёт plain text c <pre>.
 * Для .pdf — отдаёт сам PDF inline (браузер откроет нативно).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!ULID_REGEX.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [file] = await db
    .select({
      id: schema.files.id,
      folderId: schema.files.folderId,
      filename: schema.files.filename,
      storagePath: schema.files.storagePath,
      mime: schema.files.mime,
    })
    .from(schema.files)
    .where(eq(schema.files.id, id))
    .limit(1);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [folder] = await db
    .select({ userId: schema.folders.userId })
    .from(schema.folders)
    .where(eq(schema.folders.id, file.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sandbox-assert: storagePath обязан резолвиться под UPLOADS_ROOT/<folderId>/.
  const folderRoot = path.resolve(env.UPLOADS_ROOT, file.folderId);
  const resolved = path.resolve(file.storagePath);
  if (resolved !== folderRoot && !resolved.startsWith(folderRoot + path.sep)) {
    return NextResponse.json({ error: "path_escape" }, { status: 403 });
  }

  try {
    await stat(resolved);
  } catch {
    return NextResponse.json({ error: "file_missing_on_disk" }, { status: 410 });
  }

  const lower = file.filename.toLowerCase();

  // .docx → HTML через mammoth
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ path: resolved });
    const html =
      HTML_HEAD +
      `<header style="opacity:0.6;font-size:0.85rem;margin-bottom:1.5rem;border-bottom:1px solid #e0dccd;padding-bottom:0.5rem;">📄 ${escapeHtml(file.filename)}</header>` +
      result.value +
      HTML_TAIL;
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // .md / .txt / любой text — pre-форматированный inline
  if (
    /\.(md|markdown|txt|json|yaml|yml|csv|log|html|css|js|ts|xml)$/i.test(lower) ||
    file.mime?.startsWith("text/")
  ) {
    const buf = await readFile(resolved, "utf8");
    const html =
      HTML_HEAD +
      `<header style="opacity:0.6;font-size:0.85rem;margin-bottom:1.5rem;border-bottom:1px solid #e0dccd;padding-bottom:0.5rem;">📝 ${escapeHtml(file.filename)}</header>` +
      `<pre style="white-space:pre-wrap;font-family:'Source Serif Pro',serif;font-size:0.95rem;">${escapeHtml(buf)}</pre>` +
      HTML_TAIL;
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // .pdf и др. — fallback на raw inline (браузер сам отрисует)
  const buf = await readFile(resolved);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "cache-control": "private, no-cache",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
