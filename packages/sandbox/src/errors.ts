/**
 * Коды ошибок sandbox-операций. Используются для машинной обработки на API-слое
 * (например, мап в HTTP-статус) и для логирования.
 */
export type SandboxErrorCode =
  | "INVALID_FOLDER_ID"
  | "NUL_BYTE"
  | "PATH_SEPARATOR"
  | "DOT_NAME"
  | "ESCAPE"
  | "SYMLINK"
  | "TOO_LONG"
  | "MIME_NOT_ALLOWED"
  | "MAGIC_MISMATCH"
  | "TOO_LARGE"
  | "EMPTY_FILE"
  | "EXCLUSIVE_CREATE_FAILED";

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  constructor(code: SandboxErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SandboxError";
  }
}
