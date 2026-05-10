import {
  bigserial,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Подробный лог tool-вызовов с input/output. Для citation-verifier и cost-attribution.
 * `output` обрезается до ~2 KB (`output_truncated=true` если урезали) — большие НПА-документы
 * не должны раздувать БД.
 */
export const toolCallLog = pgTable(
  "tool_call_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    turnId: uuid("turn_id").notNull(),
    folderId: char("folder_id", { length: 26 }).notNull(),
    name: text("name").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    outputTruncated: boolean("output_truncated").notNull().default(false),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_tool_call_log_turn").on(t.turnId)],
);

export type DbToolCallLog = typeof toolCallLog.$inferSelect;
export type NewDbToolCallLog = typeof toolCallLog.$inferInsert;
