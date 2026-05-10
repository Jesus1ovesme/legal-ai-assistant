/**
 * Идемпотентный bootstrap проекта:
 *   1. Применяет SQL-миграции из packages/db/migrations/, если ещё не применены.
 *   2. Создаёт первого пользователя (юриста) с фикс. паролем из .env, если users пуст.
 *
 * Запуск:
 *   pnpm bootstrap:user
 *
 * Безопасно к повторному вызову — при втором запуске оба шага no-op.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";
import { ulid } from "ulid";

const { Client } = pg;
type PgClient = InstanceType<typeof pg.Client>;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, "..", ".env") });

const REQUIRED_ENV = [
  "DATABASE_URL",
  "BOOTSTRAP_EMAIL",
  "BOOTSTRAP_PASSWORD",
] as const;

function requireEnv(): { databaseUrl: string; email: string; password: string; displayName: string } {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}. Make sure .env is loaded.`);
  }
  return {
    databaseUrl: process.env.DATABASE_URL!,
    email: process.env.BOOTSTRAP_EMAIL!,
    password: process.env.BOOTSTRAP_PASSWORD!,
    displayName: process.env.BOOTSTRAP_DISPLAY_NAME ?? "Юрист",
  };
}

async function applyMigrations(client: PgClient, migrationsDir: string): Promise<void> {
  // Простейшая миграция-таблица. drizzle-kit использует другой формат
  // (`__drizzle_migrations`), но для bootstrap'а нам достаточно своей.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [file],
    );
    if (rows.length > 0) {
      console.log(`  · ${file} — уже применён`);
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`  → ${file} — применяем (${sql.length} символов)…`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  ✓ ${file} — OK`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(
        `Миграция ${file} упала: ${(err as Error).message}\n` +
          `Откатили транзакцию. Проверь SQL и состояние БД.`,
      );
    }
  }
}

async function ensureBootstrapUser(
  client: PgClient,
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  const { rows: existing } = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users",
  );
  const count = parseInt(existing[0]?.count ?? "0", 10);
  if (count > 0) {
    console.log(`  · users уже содержит ${count} запись — bootstrap не нужен`);
    return;
  }
  const id = ulid();
  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)`,
    [id, email, passwordHash, displayName],
  );
  console.log(`  ✓ Создан пользователь ${email} (id=${id})`);
}

async function main(): Promise<void> {
  const env = requireEnv();
  const migrationsDir = path.resolve(__dirname, "..", "packages", "db", "migrations");

  console.log(`[bootstrap] DB: ${env.databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[bootstrap] migrations dir: ${migrationsDir}`);

  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    console.log("[bootstrap] 1/2 Применяем миграции…");
    await applyMigrations(client, migrationsDir);
    console.log("[bootstrap] 2/2 Bootstrap пользователя…");
    await ensureBootstrapUser(client, env.email, env.password, env.displayName);
    console.log("[bootstrap] ✓ Готово");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[bootstrap] ✗ Ошибка:", err);
  process.exit(1);
});
