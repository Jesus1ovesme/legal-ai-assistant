import { createHash } from "node:crypto";
import { eq, and, gt, sql } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("[legal-mcp] DATABASE_URL not set, cache disabled");
}

// Singleton drizzle client. MCP server переживает много вызовов в одной сессии.
const db = DB_URL ? createDb({ connectionString: DB_URL }) : null;

export function hashQuery(parts: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(parts, Object.keys(parts).sort()))
    .digest("hex");
}

const COURT_TTL_HOURS = 24;
const NPA_TTL_DAYS = 7;

/** Read court_search_cache. Returns null if cache miss / expired. */
export async function readCourtCache<T>(queryHash: string): Promise<T | null> {
  if (!db) return null;
  const [row] = await db
    .select({ results: schema.courtSearchCache.results, fetchedAt: schema.courtSearchCache.fetchedAt })
    .from(schema.courtSearchCache)
    .where(
      and(
        eq(schema.courtSearchCache.queryHash, queryHash),
        gt(schema.courtSearchCache.fetchedAt, sql`now() - interval '${sql.raw(`${COURT_TTL_HOURS} hours`)}'`),
      ),
    )
    .limit(1);
  if (!row) return null;
  return row.results as T;
}

export async function writeCourtCache(queryHash: string, results: unknown): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.courtSearchCache)
    .values({ queryHash, results: results as object, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.courtSearchCache.queryHash,
      set: { results: results as object, fetchedAt: new Date() },
    });
}

/** Read npa_search_cache. TTL 7 дней. */
export async function readNpaCache<T>(queryHash: string): Promise<T | null> {
  if (!db) return null;
  const [row] = await db
    .select({ results: schema.npaSearchCache.results, fetchedAt: schema.npaSearchCache.fetchedAt })
    .from(schema.npaSearchCache)
    .where(
      and(
        eq(schema.npaSearchCache.queryHash, queryHash),
        gt(schema.npaSearchCache.fetchedAt, sql`now() - interval '7 days'`),
      ),
    )
    .limit(1);
  if (!row) return null;
  return row.results as T;
}

export async function writeNpaCache(queryHash: string, results: unknown): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.npaSearchCache)
    .values({ queryHash, results: results as object, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.npaSearchCache.queryHash,
      set: { results: results as object, fetchedAt: new Date() },
    });
}

/** Read npa_doc_cache (по URL hash). */
export async function readDocCache(urlHash: string): Promise<{ title: string; fullTextMd: string } | null> {
  if (!db) return null;
  const [row] = await db
    .select({
      title: schema.npaDocCache.title,
      fullTextMd: schema.npaDocCache.fullTextMd,
      fetchedAt: schema.npaDocCache.fetchedAt,
    })
    .from(schema.npaDocCache)
    .where(
      and(
        eq(schema.npaDocCache.urlHash, urlHash),
        gt(schema.npaDocCache.fetchedAt, sql`now() - interval '${sql.raw(`${NPA_TTL_DAYS} days`)}'`),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { title: row.title ?? "", fullTextMd: row.fullTextMd };
}

export async function writeDocCache(
  urlHash: string,
  url: string,
  title: string,
  fullTextMd: string,
): Promise<void> {
  if (!db) return;
  await db
    .insert(schema.npaDocCache)
    .values({ urlHash, url, title, fullTextMd, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.npaDocCache.urlHash,
      set: { title, fullTextMd, fetchedAt: new Date() },
    });
}
