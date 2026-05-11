import { sql } from "drizzle-orm";
import { boolean, char, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { caseTypeEnum, effortEnum } from "./enums";
import { users } from "./users";

/**
 * Папка дела = чат-сессия. См. domain-описание в @legal-ai-assistant/types/folder.ts.
 *
 * `system_prompt` копируется из YAML-пресета на момент создания, чтобы изменения
 * YAML позже не ломали семантику существующих папок (audit safety).
 */
export const folders = pgTable(
  "folders",
  {
    id: char("id", { length: 26 }).primaryKey(),
    userId: char("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    caseType: caseTypeEnum("case_type").notNull().default("GENERAL"),
    systemPrompt: text("system_prompt").notNull(),
    effort: effortEnum("effort").notNull().default("max"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_folders_user_active").on(t.userId, t.archived, sql`${t.updatedAt} DESC`),
  ],
);

export type DbFolder = typeof folders.$inferSelect;
export type NewDbFolder = typeof folders.$inferInsert;
