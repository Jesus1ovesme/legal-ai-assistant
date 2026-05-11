import * as path from "node:path";
import * as fs from "node:fs";
import { ULID_REGEX } from "@legal-ai-assistant/types";
import { SandboxError } from "./errors";

/** Максимальная длина имени файла на диске (большинство FS — 255). */
export const MAX_FILENAME_LENGTH = 200;

export interface ResolveSandboxPathOptions {
  /** Корень загрузок, например "./uploads" из ENV.UPLOADS_ROOT. Должен существовать и быть директорией. */
  rootDir: string;
  /** ULID папки. Валидируется регексом. */
  folderId: string;
  /** Имя файла на диске. Обычно `<sha256>.<ext>`, никогда не оригинальное имя пользователя. */
  filename: string;
}

/**
 * Безопасное построение пути внутри папки sandbox'а.
 *
 * Защита от:
 *   - произвольного `folderId` → строгий ULID-regex.
 *   - NUL-byte injection → пустой rejection.
 *   - path-separator в filename → запрет `/` `\`.
 *   - dot-имени `.` `..` → rejection.
 *   - длины >200 символов → rejection.
 *   - escape через `..` → проверка `startsWith(folderDir + sep)`.
 *
 * НЕ защищает от:
 *   - симлинков в parent-каталогах (см. {@link assertNoSymlinks}, надо вызывать отдельно перед mkdir/write).
 *
 * @returns абсолютный путь, безопасный для последующего fs-write.
 */
export function resolveSandboxPath(opts: ResolveSandboxPathOptions): string {
  const { rootDir, folderId, filename } = opts;

  if (!ULID_REGEX.test(folderId)) {
    throw new SandboxError("INVALID_FOLDER_ID", `folderId="${folderId}" is not a valid ULID`);
  }
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) {
    throw new SandboxError("TOO_LONG", `filename length ${filename.length}`);
  }
  if (filename.includes("\0")) {
    throw new SandboxError("NUL_BYTE");
  }
  if (filename.includes("/") || filename.includes("\\")) {
    throw new SandboxError("PATH_SEPARATOR");
  }
  if (filename === "." || filename === "..") {
    throw new SandboxError("DOT_NAME");
  }

  const absRoot = path.resolve(rootDir);
  const folderDir = path.resolve(absRoot, folderId);
  const full = path.resolve(folderDir, filename);

  // Проверка с явным sep — иначе `/a/b` совпало бы с `/a/b-other/`.
  const folderDirWithSep = folderDir.endsWith(path.sep) ? folderDir : folderDir + path.sep;
  if (!full.startsWith(folderDirWithSep)) {
    throw new SandboxError("ESCAPE", `${full} escapes ${folderDir}`);
  }
  return full;
}

/**
 * Проверяет, что ни один компонент пути от `rootDir` до `target` не является symlink'ом.
 * Защита от race-condition (TOCTOU): между resolveSandboxPath() и fs.open() злоумышленник
 * не успеет создать симлинк, потому что папка `<folderId>` создаётся mkdir с {recursive,fs.constants}
 * и проверяется на каждом шаге.
 */
export function assertNoSymlinks(rootDir: string, target: string): void {
  const absRoot = path.resolve(rootDir);
  const absTarget = path.resolve(target);
  if (!absTarget.startsWith(absRoot)) {
    throw new SandboxError("ESCAPE", `${absTarget} not under ${absRoot}`);
  }
  const rel = path.relative(absRoot, absTarget);
  const parts = rel.split(path.sep).filter(Boolean);
  let current = absRoot;
  for (const part of parts) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      // Если последний компонент ещё не создан — это ок (мы как раз собираемся писать).
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    if (stat.isSymbolicLink()) {
      throw new SandboxError("SYMLINK", `${current} is a symlink`);
    }
  }
}
