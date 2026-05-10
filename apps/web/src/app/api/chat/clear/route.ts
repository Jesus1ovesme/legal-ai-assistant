import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  folderId: z.string().regex(ULID_REGEX),
});

/**
 * POST /api/chat/clear?folderId=ULID — помечает все активные сообщения папки как archived.
 * Не удаляет — можно восстановить через `messages.archived=true → false`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ folderId: url.searchParams.get("folderId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_folder_id" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [folder] = await db
    .select({ userId: schema.folders.userId })
    .from(schema.folders)
    .where(eq(schema.folders.id, parsed.data.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }

  const result = await db
    .update(schema.messages)
    .set({ archived: true })
    .where(
      and(
        eq(schema.messages.folderId, parsed.data.folderId),
        eq(schema.messages.archived, false),
      ),
    )
    .returning({ id: schema.messages.id });

  await db.insert(schema.auditLog).values({
    action: "CHAT_CLEAR",
    userId: auth.userId,
    folderId: parsed.data.folderId,
    requestId: req.headers.get("x-request-id") ?? null,
    payload: { archivedCount: result.length },
    ip: req.headers.get("x-forwarded-for") ?? null,
  });

  return NextResponse.json({ ok: true, archived: result.length });
}
