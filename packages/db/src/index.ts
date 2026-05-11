import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "./schema/index";

export type DrizzleClient = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | null = null;
let _db: DrizzleClient | null = null;

export interface CreateDbOptions {
  /** PostgreSQL connection string (postgresql://user:pass@host:port/db). */
  connectionString: string;
  /** Размер пула (default 10). На MVP single-user 5 достаточно. */
  poolMax?: number;
  /** Idle-таймаут в мс (default 30s). */
  idleTimeoutMs?: number;
}

/**
 * Singleton-фабрика drizzle-клиента + PG pool. Безопасна к повторному вызову (idempotent).
 *
 * Использование:
 * ```ts
 * import { createDb } from "@legal-ai-assistant/db";
 * const db = createDb({ connectionString: process.env.DATABASE_URL! });
 * const folder = await db.query.folders.findFirst({...});
 * ```
 */
export function createDb(opts: CreateDbOptions): DrizzleClient {
  if (_db) return _db;
  _pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.poolMax ?? 5,
    idleTimeoutMillis: opts.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    allowExitOnIdle: false,
  });
  // Без error-handler'а idle-disconnect (RST от pg / firewall / sleep) уронит
  // процесс через unhandled "error". Логируем — pool сам выкинет мёртвого
  // клиента, следующий .connect() возьмёт свежего.
  _pool.on("error", (err) => {
    console.error("[db] idle pool error:", err.message);
  });
  _db = drizzle(_pool, { schema, casing: "snake_case" });
  return _db;
}

/** Корректное завершение pool (для graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export { schema } from "./schema/index";
export * from "./schema/index";
export { newUlid } from "./ulid";
