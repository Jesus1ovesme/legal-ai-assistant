import { bigint, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Снимки rate-limit заголовков Anthropic API после каждого turn'а.
 * Используется UI-индикатором "Сообщений N/225 · сброс HH:MM" и для блокировки submit.
 */
export const claudeQuota = pgTable("claude_quota", {
  id: serial("id").primaryKey(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  requestsLeft: integer("requests_left"),
  tokensLeft: bigint("tokens_left", { mode: "number" }),
  scope: text("scope"),
});

export type DbClaudeQuota = typeof claudeQuota.$inferSelect;
export type NewDbClaudeQuota = typeof claudeQuota.$inferInsert;
