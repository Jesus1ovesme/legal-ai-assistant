/**
 * Сканер папки дела на диске. Регистрирует в БД все файлы которых там ещё нет.
 *
 * Используется после chat-turn'а — Claude может Write'нуть PDF/MD/TXT через свой
 * Write tool напрямую в `<UPLOADS>/<folderId>/`. Этот endpoint обнаруживает их
 * и заводит rows в `files` чтобы DocumentPreview увидел.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, lstat, stat } from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { detectMime } from "@legal-ai-assistant/sandbox";
import { schema, newUlid, type DrizzleClient } from "@legal-ai-assistant/db";
import type { Logger } from "pino";

interface RegisterOpts {
  db: DrizzleClient;
  folderId: string;
  uploadsRoot: string;
  userId: string;
  log: Logger;
}

const MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024;

// Рекурсивный обход с лимитом глубины (защита от symlink loop / гигантских деревьев).
const MAX_DEPTH = 6;
const MAX_ENTRIES = 2000;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".cache",
  ".venv",
  ".idea",
  ".claude", // sandbox-конфиг term-server
]);
const SKIP_FILES = new Set([
  "CLAUDE.md", // system prompt — служебный файл, не документ дела
]);

async function walk(
  dir: string,
  baseDir: string,
  depth: number,
  collected: Array<{ relPath: string; full: string }>,
): Promise<void> {
  if (depth > MAX_DEPTH || collected.length >= MAX_ENTRIES) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (collected.length >= MAX_ENTRIES) return;
    if (name.startsWith(".")) continue;
    if (name.endsWith(".ocr.txt")) continue;
    if (SKIP_DIRS.has(name)) continue;
    if (SKIP_FILES.has(name)) continue;

    const full = path.join(dir, name);
    let st;
    try {
      // lstat — не разыменовывать symlink. fs.stat() следует по ссылке и
      // st.isSymbolicLink() всегда false → раньше скан выходил за песочницу.
      st = await lstat(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    // Defense-in-depth: даже без symlink'ов проверим что путь под baseDir.
    const rel = path.relative(baseDir, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    if (st.isDirectory()) {
      await walk(full, baseDir, depth + 1, collected);
    } else if (st.isFile()) {
      collected.push({ relPath: rel, full });
    }
  }
}

export async function registerNewFilesFromFs(opts: RegisterOpts): Promise<number> {
  const cwd = path.join(opts.uploadsRoot, opts.folderId);

  const found: Array<{ relPath: string; full: string }> = [];
  try {
    await walk(cwd, cwd, 0, found);
  } catch {
    return 0;
  }
  if (found.length === 0) return 0;

  // Уже зарегистрированные sha256 в этой папке — чтобы избежать дублей.
  const existing = await opts.db
    .select({ sha256: schema.files.sha256, storagePath: schema.files.storagePath })
    .from(schema.files)
    .where(eq(schema.files.folderId, opts.folderId));
  const existingShas = new Set(existing.map((e) => e.sha256));
  const existingPaths = new Set(existing.map((e) => e.storagePath));

  let registered = 0;
  const newPendingFileIds: string[] = [];
  for (const { relPath, full } of found) {
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size === 0 || st.size > MAX_FILE_SIZE_BYTES) continue;
    if (existingPaths.has(full)) continue;

    let buf: Buffer;
    try {
      buf = await readFile(full);
    } catch {
      continue;
    }
    const sha256 = createHash("sha256").update(buf).digest("hex");
    if (existingShas.has(sha256)) continue;

    const baseName = path.basename(relPath);
    const detected = await detectMime(new Uint8Array(buf));
    let mime = detected?.mime ?? null;
    if (!mime && /\.(md|markdown|txt|json|yaml|yml|csv|log|xml|html|css|js|ts)$/i.test(baseName)) {
      mime = baseName.toLowerCase().endsWith(".md") || baseName.toLowerCase().endsWith(".markdown")
        ? "text/markdown"
        : "text/plain";
    }
    if (!mime) {
      mime = "application/octet-stream";
    }

    const isText = mime.startsWith("text/") || mime === "application/json";
    const fileId = newUlid();
    try {
      await opts.db.insert(schema.files).values({
        id: fileId,
        folderId: opts.folderId,
        // filename = относительный путь от cwd (echo-stseny/01-istoriya/fabula.md),
        // чтобы UI отображал структуру дерева.
        filename: relPath,
        storagePath: full,
        mime,
        sizeBytes: st.size,
        sha256,
        ocrStatus: isText ? "done" : "pending",
        ocrText: isText ? buf.toString("utf8").slice(0, 500_000) : null,
      });
      await opts.db.insert(schema.auditLog).values({
        action: "FILE_AUTO_REGISTER",
        userId: opts.userId,
        folderId: opts.folderId,
        payload: { fileId, filename: relPath, mime, sizeBytes: st.size, source: "claude_write" },
      });
      registered++;
      // Только не-текстовые — текстовые уже ocrStatus=done, OCR не нужен.
      if (!isText) newPendingFileIds.push(fileId);
      opts.log.info({ fileId, filename: relPath, mime, sizeBytes: st.size }, "file_auto_registered");
    } catch (err) {
      opts.log.debug({ err: (err as Error).message, relPath }, "register_skip");
    }
  }

  // Enqueue OCR только для свежезарегистрированных pending. Раньше брали все
  // файлы папки (включая давно done) — N×rerun, лишний трафик в pg-boss.
  if (newPendingFileIds.length > 0) {
    try {
      const PgBoss = (await import("pg-boss")).default;
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL!,
        schema: "pgboss",
      });
      await boss.start();
      await boss.createQueue("ocr.run").catch(() => {});
      for (const id of newPendingFileIds) {
        await boss.send("ocr.run", { fileId: id });
      }
      await boss.stop({ graceful: false }).catch(() => {});
    } catch (err) {
      opts.log.warn({ err: (err as Error).message }, "ocr_enqueue_failed");
    }
  }

  return registered;
}
