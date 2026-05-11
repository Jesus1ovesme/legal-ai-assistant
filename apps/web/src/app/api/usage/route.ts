import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createDb, schema } from "@legal-ai-assistant/db";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage → агрегированный расход за день и неделю.
 * Используется боковой панелью UsageBar.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const budget = {
    dayUsd: parseFloat(process.env.BUDGET_DAY_USD ?? "10"),
    weekUsd: parseFloat(process.env.BUDGET_WEEK_USD ?? "50"),
  };

  try {
    const env = getEnv();
    const db = createDb({ connectionString: env.DATABASE_URL });

    const [row] = await db
      .select({
        dayCost: sql<string>`COALESCE(SUM(CASE WHEN ${schema.auditLog.createdAt} >= NOW() - INTERVAL '24 hours' THEN ${schema.auditLog.costEstimateUsd} END), 0)::text`,
        dayCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.auditLog.createdAt} >= NOW() - INTERVAL '24 hours')::text`,
        dayTokensIn: sql<string>`COALESCE(SUM(CASE WHEN ${schema.auditLog.createdAt} >= NOW() - INTERVAL '24 hours' THEN ${schema.auditLog.inputTokens} END), 0)::text`,
        dayTokensOut: sql<string>`COALESCE(SUM(CASE WHEN ${schema.auditLog.createdAt} >= NOW() - INTERVAL '24 hours' THEN ${schema.auditLog.outputTokens} END), 0)::text`,
        weekCost: sql<string>`COALESCE(SUM(CASE WHEN ${schema.auditLog.createdAt} >= NOW() - INTERVAL '7 days' THEN ${schema.auditLog.costEstimateUsd} END), 0)::text`,
        weekCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.auditLog.createdAt} >= NOW() - INTERVAL '7 days')::text`,
      })
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.userId} = ${auth.userId} AND ${schema.auditLog.action} = 'CHAT_SEND'`,
      );

    return NextResponse.json({
      day: {
        costUsd: parseFloat(row?.dayCost ?? "0"),
        messageCount: parseInt(row?.dayCount ?? "0", 10),
        tokensIn: parseInt(row?.dayTokensIn ?? "0", 10),
        tokensOut: parseInt(row?.dayTokensOut ?? "0", 10),
      },
      week: {
        costUsd: parseFloat(row?.weekCost ?? "0"),
        messageCount: parseInt(row?.weekCount ?? "0", 10),
      },
      // Условные бюджеты для прогресс-бара (~$7/день · $50/неделя — лимит Claude Max).
      budget,
    });
  } catch (err) {
    // Fail-soft: usage — некритичная статистика. При transient-ошибке pool
    // отдаём 200 с null'ами, UsageBar покажет "…" и попробует через 60с.
    console.error("[usage] db error:", (err as Error).message);
    return NextResponse.json({ day: null, week: null, budget, error: "unavailable" });
  }
}
