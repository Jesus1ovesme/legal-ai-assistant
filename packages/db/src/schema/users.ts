import { pgTable, char, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Пользователи. На MVP — одна строка (юрист), но FK уже multi-user готов.
 * Bootstrap: scripts/bootstrap-user.ts INSERT'ит первую запись с фикс. паролем (bcrypt).
 */
export const users = pgTable("users", {
  id: char("id", { length: 26 }).primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbUser = typeof users.$inferSelect;
export type NewDbUser = typeof users.$inferInsert;
