import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { createDb, schema } from "@legal-ai-assistant/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // CSRF: без проверки злонамеренная страница могла force-logout юриста через
  // form POST. SameSite=strict cookie это митигирует, но defense-in-depth.
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

  const session = await getSession();
  const userId = session.userId;
  await session.destroy();

  if (userId) {
    const env = getEnv();
    const db = createDb({ connectionString: env.DATABASE_URL });
    await db.insert(schema.auditLog).values({
      action: "LOGOUT",
      userId,
      requestId: req.headers.get("x-request-id") ?? null,
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
