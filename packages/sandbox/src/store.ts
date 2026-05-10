import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { assertNoSymlinks, resolveSandboxPath } from "./paths";
import { SandboxError } from "./errors";

export interface WriteFileOptions {
  rootDir: string;
  folderId: string;
  /** Уже валидированный {@link DetectedFile}.ext (canonical extension). */
  ext: string;
  buf: Uint8Array;
}

export interface WrittenFile {
  /** Абсолютный путь к файлу на диске. */
  path: string;
  /** SHA-256 содержимого (hex, 64 символа). */
  sha256: string;
  /** Имя файла на диске (= "<sha256>.<ext>"). */
  filename: string;
  /** Размер в байтах. */
  sizeBytes: number;
}

/**
 * Атомарная запись файла в sandbox.
 *   1. Считает sha256.
 *   2. Создаёт каталог `<rootDir>/<folderId>/` если не существует (mkdir с recursive).
 *   3. Проверяет отсутствие симлинков на пути.
 *   4. Открывает целевой файл с флагом `wx` (exclusive) — атомарная защита от TOCTOU.
 *      Если файл уже существует (тот же sha256) → бросает SandboxError EXCLUSIVE_CREATE_FAILED.
 *      Вызывающий код должен поймать и сделать SELECT по (folderId, sha256) → 409 для пользователя.
 */
export async function writeFile(opts: WriteFileOptions): Promise<WrittenFile> {
  const sha256 = createHash("sha256").update(opts.buf).digest("hex");
  const filename = `${sha256}.${opts.ext}`;
  const target = resolveSandboxPath({
    rootDir: opts.rootDir,
    folderId: opts.folderId,
    filename,
  });

  const folderDir = path.dirname(target);
  await fs.mkdir(folderDir, { recursive: true, mode: 0o750 });

  assertNoSymlinks(opts.rootDir, target);

  let fh: fs.FileHandle | undefined;
  try {
    fh = await fs.open(target, "wx", 0o640);
    await fh.writeFile(opts.buf);
    await fh.sync();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new SandboxError("EXCLUSIVE_CREATE_FAILED", `${target} already exists`);
    }
    throw err;
  } finally {
    await fh?.close();
  }

  return { path: target, sha256, filename, sizeBytes: opts.buf.length };
}

/**
 * Удаление файла внутри sandbox'а. Безопасный resolve + unlink. Никаких glob, никаких рекурсивных rm.
 */
export async function removeFile(opts: {
  rootDir: string;
  folderId: string;
  filename: string;
}): Promise<void> {
  const target = resolveSandboxPath(opts);
  await fs.unlink(target).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  });
}
