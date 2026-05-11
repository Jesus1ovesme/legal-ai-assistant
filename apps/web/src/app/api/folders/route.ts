import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createDb, schema, newUlid } from "@legal-ai-assistant/db";
import { CaseTypeSchema, ULID_REGEX } from "@legal-ai-assistant/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { loadCaseType } from "@/lib/case-types/loader";
import { logger } from "@/lib/logger";
import { sanitizeFolderName } from "@/lib/sanitize-folder-name";

export const dynamic = "force-dynamic";

// Несколько действий через один POST endpoint — Next 15 dev в monorepo не подхватывает
// PATCH/DELETE handlers и handlers на nested dynamic routes. Workaround: discriminated body.
const FolderActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(200),
    caseType: CaseTypeSchema,
  }),
  z.object({
    action: z.literal("rename"),
    id: z.string().regex(ULID_REGEX),
    name: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().regex(ULID_REGEX),
  }),
  z.object({
    action: z.literal("delete-bulk"),
    ids: z.array(z.string().regex(ULID_REGEX)).min(1).max(200),
  }),
]);

/** GET /api/folders → список активных папок текущего юзера. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });
  // Два запроса параллельно: список папок + GROUP BY count для каждой.
  // Это надёжнее sql<number>-subquery (drizzle иногда теряет alias в проде).
  const [folders, counts] = await Promise.all([
    db
      .select({
        id: schema.folders.id,
        name: schema.folders.name,
        caseType: schema.folders.caseType,
        effort: schema.folders.effort,
        archived: schema.folders.archived,
        createdAt: schema.folders.createdAt,
        updatedAt: schema.folders.updatedAt,
      })
      .from(schema.folders)
      .where(and(eq(schema.folders.userId, auth.userId), eq(schema.folders.archived, false)))
      .orderBy(desc(schema.folders.updatedAt)),
    db
      .select({
        folderId: schema.files.folderId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.files)
      .groupBy(schema.files.folderId),
  ]);
  const countMap = new Map(counts.map((c) => [c.folderId, Number(c.count) || 0]));
  const enriched = folders.map((f) => ({ ...f, fileCount: countMap.get(f.id) ?? 0 }));
  return NextResponse.json({ folders: enriched });
}

/** POST /api/folders → multiple actions: create | rename | delete (через body.action). */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Backward-compat: старые клиенты POST'ят без поля action — считаем create.
  if (typeof body === "object" && body !== null && !("action" in body)) {
    (body as Record<string, unknown>).action = "create";
  }

  const parsed = FolderActionSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn(
      { body, errors: parsed.error.flatten(), userId: auth.userId },
      "folder_action_validation_failed",
    );
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  if (parsed.data.action === "create") {
    const cleanName = sanitizeFolderName(parsed.data.name);
    if (!cleanName) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    const caseTypeDef = loadCaseType(parsed.data.caseType);
    const id = newUlid();
    await db.insert(schema.folders).values({
      id,
      userId: auth.userId,
      name: cleanName,
      caseType: parsed.data.caseType,
      systemPrompt: caseTypeDef.system_prompt,
      effort: "max",
    });
    await db.insert(schema.auditLog).values({
      action: "FOLDER_CREATE",
      userId: auth.userId,
      folderId: id,
      requestId: req.headers.get("x-request-id") ?? null,
      payload: { name: cleanName, caseType: parsed.data.caseType },
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    logger.info({ userId: auth.userId, folderId: id }, "folder_created");
    return NextResponse.json({ id }, { status: 201 });
  }

  if (parsed.data.action === "rename") {
    const cleanName = sanitizeFolderName(parsed.data.name);
    if (!cleanName) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    const result = await db
      .update(schema.folders)
      .set({ name: cleanName })
      .where(
        and(eq(schema.folders.id, parsed.data.id), eq(schema.folders.userId, auth.userId)),
      )
      .returning({ id: schema.folders.id });
    if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await db.insert(schema.auditLog).values({
      action: "FOLDER_RENAME",
      userId: auth.userId,
      folderId: parsed.data.id,
      payload: { newName: cleanName },
      requestId: req.headers.get("x-request-id") ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "delete") {
    const result = await db
      .update(schema.folders)
      .set({ archived: true })
      .where(
        and(eq(schema.folders.id, parsed.data.id), eq(schema.folders.userId, auth.userId)),
      )
      .returning({ id: schema.folders.id });
    if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await db.insert(schema.auditLog).values({
      action: "FOLDER_ARCHIVE",
      userId: auth.userId,
      folderId: parsed.data.id,
      requestId: req.headers.get("x-request-id") ?? null,
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "delete-bulk") {
    const { inArray } = await import("drizzle-orm");
    const result = await db
      .update(schema.folders)
      .set({ archived: true })
      .where(
        and(
          inArray(schema.folders.id, parsed.data.ids),
          eq(schema.folders.userId, auth.userId),
        ),
      )
      .returning({ id: schema.folders.id });
    await db.insert(schema.auditLog).values({
      action: "FOLDER_ARCHIVE_BULK",
      userId: auth.userId,
      payload: { count: result.length, ids: result.map((r) => r.id) },
      requestId: req.headers.get("x-request-id") ?? null,
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return NextResponse.json({ ok: true, archived: result.length });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
