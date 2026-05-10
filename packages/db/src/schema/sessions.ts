import { sql } from "drizzle-orm";
import { char, inet, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Серверная запись сессии. iron-session шифрует payload в cookie самостоятельно,
 * но для возможности revoke и аудита (с кем/откуда) храним id сессии в этой таблице.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: char("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_sessions_user_active")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export type DbSession = typeof sessions.$inferSelect;
export type NewDbSession = typeof sessions.$inferInsert;
