import { SandboxError } from "./errors";
import { detectMime, type DetectedFile } from "./magic";

export interface ValidateUploadOptions {
  /** Максимальный размер в байтах (например, 50 * 1024 * 1024). */
  maxSizeBytes: number;
}

/**
 * Полная валидация загруженного буфера: размер, MIME через magic-byte.
 * Бросает {@link SandboxError} при любом нарушении.
 */
export async function validateUpload(
  buf: Uint8Array,
  opts: ValidateUploadOptions,
): Promise<DetectedFile> {
  if (buf.length === 0) {
    throw new SandboxError("EMPTY_FILE");
  }
  if (buf.length > opts.maxSizeBytes) {
    throw new SandboxError("TOO_LARGE", `${buf.length} > ${opts.maxSizeBytes}`);
  }
  const detected = await detectMime(buf);
  if (!detected) {
    throw new SandboxError("MIME_NOT_ALLOWED");
  }
  return detected;
}
