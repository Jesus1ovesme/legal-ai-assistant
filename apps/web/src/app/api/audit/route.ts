import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { createDb, schema } from "@legal-ai-assistant/db";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

/** GET /api/audit?limit=100 → последние записи audit_log текущего юзера. */
export async function GET(req: Request) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      folderId: schema.auditLog.folderId,
      model: schema.auditLog.model,
      effort: schema.auditLog.effort,
      latencyMs: schema.auditLog.latencyMs,
      costEstimateUsd: schema.auditLog.costEstimateUsd,
      payload: schema.auditLog.payload,
      ip: schema.auditLog.ip,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, auth.userId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);

  return NextResponse.json({
    audit: rows.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      folderId: r.folderId,
      model: r.model,
      effort: r.effort,
      latencyMs: r.latencyMs,
      costUsd: r.costEstimateUsd ? parseFloat(r.costEstimateUsd) : null,
      payload: r.payload,
      ip: r.ip,
      createdAt: r.createdAt,
    })),
  });
}
