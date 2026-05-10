import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set; load .env before running drizzle-kit");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
  // Custom miграции (extensions, vector type, partial индексы) — пишем вручную.
  // drizzle-kit подхватит их в одной последовательности с generated SQL.
});
