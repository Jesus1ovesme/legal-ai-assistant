import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@legal-ai-assistant/db";
import { ULID_REGEX } from "@legal-ai-assistant/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  folderId: z.string().regex(ULID_REGEX),
});

/** GET /api/files?folderId=ULID → список файлов папки. */
export async function GET(req: Request) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

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

  const rows = await db
    .select({
      id: schema.files.id,
      filename: schema.files.filename,
      mime: schema.files.mime,
      sizeBytes: schema.files.sizeBytes,
      ocrStatus: schema.files.ocrStatus,
      createdAt: schema.files.createdAt,
    })
    .from(schema.files)
    .where(
      and(
        eq(schema.files.folderId, parsed.data.folderId),
      ),
    )
    .orderBy(desc(schema.files.createdAt));

  return NextResponse.json({ files: rows });
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    id: z.string().regex(ULID_REGEX),
  }),
  z.object({
    action: z.literal("delete-bulk"),
    ids: z.array(z.string().regex(ULID_REGEX)).min(1).max(200),
  }),
]);

/**
 * POST /api/files
 *   body { action: "delete", id }       — удалить один файл
 *   body { action: "delete-bulk", ids } — массовое удаление
 *
 * Используем discriminated POST вместо DELETE /[id] потому что Next 15 dev
 * возвращает 405 Allow:GET,HEAD на dynamic route с DELETE/POST методами.
 */
export async function POST(req: Request) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const ids = parsed.data.action === "delete" ? [parsed.data.id] : parsed.data.ids;
  let removed = 0;
  for (const id of ids) {
    const [file] = await db
      .select({
        id: schema.files.id,
        folderId: schema.files.folderId,
        storagePath: schema.files.storagePath,
      })
      .from(schema.files)
      .where(eq(schema.files.id, id))
      .limit(1);
    if (!file) continue;

    const [folder] = await db
      .select({ userId: schema.folders.userId })
      .from(schema.folders)
      .where(eq(schema.folders.id, file.folderId))
      .limit(1);
    if (!folder || folder.userId !== auth.userId) continue;

    try {
      await unlink(file.storagePath);
    } catch (_) {
      /* file already gone */
    }
    try {
      await unlink(`${file.storagePath}.ocr.txt`);
    } catch (_) {
      /* no sidecar */
    }
    await db.delete(schema.files).where(eq(schema.files.id, id));
    removed++;
  }

  return NextResponse.json({ ok: true, removed });
}
