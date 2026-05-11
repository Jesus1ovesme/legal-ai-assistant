import { NextResponse } from "next/server";
import { createDb } from "@legal-ai-assistant/db";
import { getEnv } from "@/lib/env";
import { sql } from "drizzle-orm";

/**
 * Readiness probe — проверяет, что БД отвечает. Используется PM2 / nginx upstream
 * health check для решения, направлять ли траффик.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getEnv();
    const db = createDb({ connectionString: env.DATABASE_URL });
    await db.execute(sql`SELECT 1 AS ok`);
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        ts: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
