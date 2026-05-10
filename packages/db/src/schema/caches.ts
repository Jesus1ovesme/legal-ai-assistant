import { char, date, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Кэш поисковых запросов pravo.gov.ru. TTL 24h, проверка на чтении (fetched_at).
 * Hash = sha256(lower(query) + '|' + doc_type + '|' + date_from).
 */
export const npaSearchCache = pgTable("npa_search_cache", {
  queryHash: char("query_hash", { length: 64 }).primaryKey(),
  docType: text("doc_type"),
  dateFrom: date("date_from"),
  results: jsonb("results").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Кэш полных текстов НПА. TTL 7 дней. URL → markdown + structure. */
export const npaDocCache = pgTable("npa_doc_cache", {
  urlHash: char("url_hash", { length: 64 }).primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  fullTextMd: text("full_text_md").notNull(),
  structure: jsonb("structure"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Кэш поиска судпрактики (sudact.ru, kad.arbitr.ru). TTL 6h. */
export const courtSearchCache = pgTable("court_search_cache", {
  queryHash: char("query_hash", { length: 64 }).primaryKey(),
  results: jsonb("results").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbNpaSearchCache = typeof npaSearchCache.$inferSelect;
export type DbNpaDocCache = typeof npaDocCache.$inferSelect;
export type DbCourtSearchCache = typeof courtSearchCache.$inferSelect;
