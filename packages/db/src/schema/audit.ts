import { sql } from "drizzle-orm";
import {
  bigserial,
  char,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { effortEnum } from "./enums";

/**
 * Audit-лог: один turn чата = одна запись + дополнительные строки для не-chat действий
 * (LOGIN, FILE_UPLOAD, FOLDER_CREATE, OCR_DONE, EXPORT_DOCX, ...).
 * Нет PII в payload — только id-шники и метрики.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    turnId: uuid("turn_id"),
    folderId: char("folder_id", { length: 26 }),
    userId: char("user_id", { length: 26 }),
    action: text("action").notNull(),
    model: text("model"),
    effort: effortEnum("effort"),
    inputTokens: integer("input_tokens"),
    cacheReadTokens: integer("cache_read_tokens").default(0),
    cacheWriteTokens: integer("cache_write_tokens").default(0),
    outputTokens: integer("output_tokens"),
    thinkingTokens: integer("thinking_tokens").default(0),
    costEstimateUsd: numeric("cost_estimate_usd", { precision: 10, scale: 6 }),
    latencyMs: integer("latency_ms"),
    toolCalls: jsonb("tool_calls"),
    payload: jsonb("payload"),
    requestId: text("request_id"),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_folder_time").on(t.folderId, sql`${t.createdAt} DESC`),
    index("idx_audit_user_time").on(t.userId, sql`${t.createdAt} DESC`),
    index("idx_audit_action_time").on(t.action, sql`${t.createdAt} DESC`),
  ],
);

export type DbAuditLog = typeof auditLog.$inferSelect;
export type NewDbAuditLog = typeof auditLog.$inferInsert;
