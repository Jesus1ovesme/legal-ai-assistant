import { customType, char, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { folders } from "./folders";
import { files } from "./files";

/**
 * Custom drizzle column для pgvector. Drizzle хранит как массив чисел в TS,
 * сериализует в pgvector строковый формат `[0.12,0.34,…]` при отправке в БД.
 * Размерность зависит от {@link EMBEDDING_DIM} env (1024 для multilingual-e5-large).
 */
export const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (Array.isArray(value)) return value as number[];
    return JSON.parse(value as string) as number[];
  },
});

/**
 * Embeddings пользовательских файлов. Один файл → много чанков.
 * folder_id денормализован для фильтра по папке без JOIN (производительность retrieval).
 *
 * Index: HNSW (m=16, ef_construction=64) — задаётся вручную в SQL миграции (drizzle-kit
 * не генерирует HNSW параметры).
 */
export const embeddings = pgTable(
  "embeddings",
  {
    id: char("id", { length: 26 }).primaryKey(),
    fileId: char("file_id", { length: 26 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    folderId: char("folder_id", { length: 26 })
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_embeddings_folder").on(t.folderId),
    index("idx_embeddings_file").on(t.fileId, t.chunkIndex),
  ],
);

export type DbEmbedding = typeof embeddings.$inferSelect;
export type NewDbEmbedding = typeof embeddings.$inferInsert;
