import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

/** GET /api/usage/today → накопленный cost + кол-во чат-сообщений за текущие 24ч. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const rows = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${schema.auditLog.costEstimateUsd}), 0)`,
      messageCount: sql<string>`COUNT(*)::text`,
      latencySum: sql<string>`COALESCE(SUM(${schema.auditLog.latencyMs}), 0)::text`,
    })
    .from(schema.auditLog)
    .where(
      sql`${schema.auditLog.userId} = ${auth.userId}
          AND ${schema.auditLog.action} = 'CHAT_SEND'
          AND ${schema.auditLog.createdAt} >= NOW() - INTERVAL '24 hours'`,
    );

  const r = rows[0] ?? { totalCost: "0", messageCount: "0", latencySum: "0" };
  return NextResponse.json({
    totalCostUsd: parseFloat(r.totalCost),
    messageCount: parseInt(r.messageCount, 10),
    avgLatencyMs:
      parseInt(r.messageCount, 10) > 0
        ? Math.round(parseInt(r.latencySum, 10) / parseInt(r.messageCount, 10))
        : 0,
  });
}
