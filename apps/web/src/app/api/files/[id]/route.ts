import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/files/[id]?download=1 — отдаёт raw содержимое файла. */
export async function GET(req: Request, { params }: Ctx) {
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
      sizeBytes: schema.files.sizeBytes,
    })
    .from(schema.files)
    .where(eq(schema.files.id, id))
    .limit(1);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Verify ownership через folder.userId
  const [folder] = await db
    .select({ userId: schema.folders.userId })
    .from(schema.folders)
    .where(eq(schema.folders.id, file.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sandbox-assert: storagePath обязан резолвиться под UPLOADS_ROOT/<folderId>/.
  // Защита от рассогласования между walker'ом и БД (если когда-нибудь через
  // symlink в `register-fs` / прямой INSERT попадёт путь наружу).
  const folderRoot = path.resolve(env.UPLOADS_ROOT, file.folderId);
  const resolved = path.resolve(file.storagePath);
  if (resolved !== folderRoot && !resolved.startsWith(folderRoot + path.sep)) {
    return NextResponse.json({ error: "path_escape" }, { status: 403 });
  }

  let buffer: Buffer;
  try {
    await stat(resolved);
    buffer = await readFile(resolved);
  } catch {
    return NextResponse.json({ error: "file_missing_on_disk" }, { status: 410 });
  }

  const url = new URL(req.url);
  const isDownload = url.searchParams.get("download") === "1";

  // Charset для текстовых форматов: иначе браузер угадывает CP1251 для русских MD/TXT
  // и показывает мусор «РЈС‡РµР±РЅРѕРµ». Все наши text-файлы пишутся в UTF-8.
  let contentType = file.mime || "application/octet-stream";
  const isTextish =
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    contentType === "application/javascript" ||
    /markdown|yaml|toml/i.test(contentType) ||
    /\.(md|markdown|txt|json|yaml|yml|csv|log|xml|html|css|js|ts)$/i.test(file.filename);
  if (isTextish && !/charset=/i.test(contentType)) {
    // Для .md без явного mime — переопределяем в text/markdown
    if (contentType === "application/octet-stream" || contentType === "text/plain") {
      const ext = file.filename.split(".").pop()?.toLowerCase();
      if (ext === "md" || ext === "markdown") contentType = "text/markdown";
      else if (contentType === "application/octet-stream") contentType = "text/plain";
    }
    contentType = `${contentType}; charset=utf-8`;
  }

  const headers = new Headers({
    "content-type": contentType,
    "content-length": String(buffer.length),
    "cache-control": "private, no-cache",
  });
  if (isDownload) {
    headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
  } else {
    // Inline preview для PDF/image/text — браузер откроет в табе.
    headers.set(
      "content-disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
  }
  return new NextResponse(new Uint8Array(buffer), { headers });
}

