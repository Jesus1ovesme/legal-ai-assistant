import { z } from "zod";
import { ULID_REGEX, type ULID } from "./ulid";

/** Состояние OCR-pipeline для файла. */
export enum OcrStatus {
  /** В очереди (только что загружен). */
  PENDING = "pending",
  /** OCR-worker взял в работу. */
  PROCESSING = "processing",
  /** Текст извлечён, готов к индексации. */
  DONE = "done",
  /** OCR упал (ocr_error содержит причину). */
  FAILED = "failed",
  /** OCR не нужен (например, аудио, текстовый файл, докс с готовым текстом). */
  SKIPPED = "skipped",
}

export const OcrStatusSchema = z.nativeEnum(OcrStatus);

/**
 * Файл, загруженный в папку дела.
 * - Storage: `<UPLOADS_ROOT>/<folderId>/<sha256>.<ext>` (имя на диске = sha256, не оригинал).
 * - Дедуп: UNIQUE(folder_id, sha256).
 * - При успешном upload: enqueue `ocr.run`. После OCR done → enqueue `embed.run`.
 */
export interface FileMeta {
  id: ULID;
  folderId: ULID;
  /** Оригинальное имя файла, как загрузил юрист. Может содержать кириллицу. */
  filename: string;
  /** Абсолютный путь на диске. Никогда не возвращается клиенту. */
  storagePath: string;
  /** Detected MIME (через magic-byte, не Content-Type). */
  mime: string;
  sizeBytes: number;
  /** SHA-256 от полного содержимого. Используется как имя на диске и для дедупликации. */
  sha256: string;
  ocrStatus: OcrStatus;
  /** Полный текст после OCR (или плейн-текст для txt/docx). NULL пока pending/processing/failed. */
  ocrText: string | null;
  ocrError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FileMetaSchema = z.object({
  id: z.string().regex(ULID_REGEX),
  folderId: z.string().regex(ULID_REGEX),
  filename: z.string().min(1).max(500),
  storagePath: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  ocrStatus: OcrStatusSchema,
  ocrText: z.string().nullable(),
  ocrError: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Лёгкая проекция для списков (без storagePath, без полного ocrText). */
export interface FileListItem {
  id: ULID;
  folderId: ULID;
  filename: string;
  mime: string;
  sizeBytes: number;
  ocrStatus: OcrStatus;
  /** Превью первые ~500 символов из OCR-output (если done). */
  ocrPreview?: string;
  createdAt: Date;
}
