/**
 * @danilurist/sandbox — изоляция файловых операций внутри `<UPLOADS_ROOT>/<folderId>/`.
 *
 * API:
 *   - {@link resolveSandboxPath} — построение безопасного абсолютного пути.
 *   - {@link assertNoSymlinks}    — отказ если parent-каталог содержит симлинк.
 *   - {@link detectMime}          — определение MIME через magic-byte (file-type).
 *   - {@link validateUpload}      — комбинированный размер+MIME guard.
 *   - {@link writeFile}           — атомарная запись с exclusive-create.
 *   - {@link removeFile}          — безопасное удаление.
 *   - {@link SandboxError}        — ошибки с машиночитаемым `code`.
 */
export { resolveSandboxPath, assertNoSymlinks, MAX_FILENAME_LENGTH } from "./paths";
export { detectMime, ALLOWED_MIMES, CANONICAL_EXTENSIONS } from "./magic";
export type { DetectedFile } from "./magic";
export { validateUpload } from "./validate";
export type { ValidateUploadOptions } from "./validate";
export { writeFile, removeFile } from "./store";
export type { WriteFileOptions, WrittenFile } from "./store";
export { SandboxError } from "./errors";
export type { SandboxErrorCode } from "./errors";
// re-export для удобства, хотя зависимый код может импортировать напрямую из @danilurist/types
export type { ULID } from "@danilurist/types";
