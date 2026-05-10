import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }
  const { id } = await params;
  if (!ULID_REGEX.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });
  const result = await db
    .update(schema.folders)
    .set({ archived: true })
    .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, auth.userId)))
    .returning({ id: schema.folders.id });
  if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.insert(schema.auditLog).values({
    action: "FOLDER_ARCHIVE",
    userId: auth.userId,
    folderId: id,
    requestId: req.headers.get("x-request-id") ?? null,
    ip: req.headers.get("x-forwarded-for") ?? null,
  });
  return NextResponse.json({ ok: true });
}
