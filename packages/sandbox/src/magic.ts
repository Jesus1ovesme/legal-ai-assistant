import { fileTypeFromBuffer } from "file-type";

/**
 * Whitelisted MIME-типы загружаемых файлов. Любой другой → 415 на API-слое.
 * Тип определяется через magic-byte (file-type), НЕ через Content-Type заголовок —
 * клиент может подделать заголовок, но не байты файла (без полноценного polyglot exploit).
 */
export const ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc (legacy)
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/ogg",
]);

/** Расширения файлов на диске для каждого MIME (canonical, не пользовательское). */
export const CANONICAL_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

export interface DetectedFile {
  mime: string;
  ext: string;
}

/**
 * Определяет MIME и расширение по содержимому. Для text/plain (без magic-байтов)
 * fallback'ится на грубую эвристику: только ASCII/UTF-8 печатные символы.
 *
 * @returns null если detected MIME не в whitelist.
 */
export async function detectMime(buf: Uint8Array): Promise<DetectedFile | null> {
  const detected = await fileTypeFromBuffer(buf);
  if (detected) {
    if (!ALLOWED_MIMES.has(detected.mime)) return null;
    const canonical = CANONICAL_EXTENSIONS[detected.mime] ?? detected.ext;
    return { mime: detected.mime, ext: canonical };
  }
  // Fallback для plain-text: file-type не детектит txt.
  if (looksLikeUtf8Text(buf)) {
    return { mime: "text/plain", ext: "txt" };
  }
  return null;
}

function looksLikeUtf8Text(buf: Uint8Array): boolean {
  // Эвристика: проверяем первые 4 KB на отсутствие NUL-байтов и преимущество печатных.
  const slice = buf.subarray(0, Math.min(buf.length, 4096));
  if (slice.length === 0) return false;
  let printable = 0;
  let nullBytes = 0;
  for (const byte of slice) {
    if (byte === 0) nullBytes++;
    if (
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      byte >= 0x80 // UTF-8 multi-byte
    ) {
      printable++;
    }
  }
  if (nullBytes > 0) return false;
  return printable / slice.length > 0.95;
}
