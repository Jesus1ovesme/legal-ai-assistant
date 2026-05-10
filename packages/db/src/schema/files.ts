import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { folders } from "./folders";
import { ocrStatusEnum } from "./enums";

/**
 * Файл, загруженный в папку. Storage path = `<UPLOADS_ROOT>/<folder_id>/<sha256>.<ext>`,
 * имя на диске = sha256 (не оригинал) для защиты от спецсимволов и для дедупликации.
 *
 * UNIQUE(folder_id, sha256) обеспечивает, что один и тот же файл не загрузится дважды
 * в одну папку — API возвращает 409 Conflict с указанием existingFileId.
 */
export const files = pgTable(
  "files",
  {
    id: char("id", { length: 26 }).primaryKey(),
    folderId: char("folder_id", { length: 26 })
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    ocrStatus: ocrStatusEnum("ocr_status").notNull().default("pending"),
    ocrText: text("ocr_text"),
    ocrError: text("ocr_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_files_folder_sha256").on(t.folderId, t.sha256),
    index("idx_files_folder").on(t.folderId, sql`${t.createdAt} DESC`),
    index("idx_files_ocr_pending")
      .on(t.ocrStatus)
      .where(sql`${t.ocrStatus} IN ('pending','processing')`),
  ],
);

export type DbFile = typeof files.$inferSelect;
export type NewDbFile = typeof files.$inferInsert;
