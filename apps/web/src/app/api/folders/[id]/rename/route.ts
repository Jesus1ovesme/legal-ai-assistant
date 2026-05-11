import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@legal-ai-assistant/db";
import { ULID_REGEX } from "@legal-ai-assistant/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { sanitizeFolderName } from "@/lib/sanitize-folder-name";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ name: z.string().min(1).max(200) });

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
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const cleanName = sanitizeFolderName(parsed.data.name);
  if (!cleanName) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });
  const result = await db
    .update(schema.folders)
    .set({ name: cleanName })
    .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, auth.userId)))
    .returning({ id: schema.folders.id });
  if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
