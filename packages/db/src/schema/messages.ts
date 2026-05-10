import { sql } from "drizzle-orm";
import {
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
import { folders } from "./folders";
import { messageRoleEnum } from "./enums";
import type { Citation, ToolCall } from "@danilurist/types";

/**
 * Сообщение в чате папки.
 * - turn_id — UUID, объединяющий все messages одного user→assistant обмена (включая tool-loop).
 * - archived=true — поставлено через 🧹 Clear (не удаляется, можно восстановить через /settings/audit).
 */
export const messages = pgTable(
  "messages",
  {
    id: char("id", { length: 26 }).primaryKey(),
    folderId: char("folder_id", { length: 26 })
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull(),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<ToolCall[]>(),
    citations: jsonb("citations").$type<Citation[]>(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_messages_folder").on(t.folderId, t.archived, t.createdAt),
    index("idx_messages_turn").on(t.turnId),
  ],
);

export type DbMessage = typeof messages.$inferSelect;
export type NewDbMessage = typeof messages.$inferInsert;
