import { and, desc, eq } from "drizzle-orm";
import type { DrizzleClient } from "../index";
import { folders, type DbFolder, type NewDbFolder } from "../schema/folders";
import { newUlid } from "../ulid";

export interface CreateFolderInput {
  userId: string;
  name: string;
  caseType: NewDbFolder["caseType"];
  systemPrompt: string;
  effort?: NewDbFolder["effort"];
}

export async function createFolder(
  db: DrizzleClient,
  input: CreateFolderInput,
): Promise<DbFolder> {
  const id = newUlid();
  const [row] = await db
    .insert(folders)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      caseType: input.caseType,
      systemPrompt: input.systemPrompt,
      effort: input.effort ?? "max",
    })
    .returning();
  if (!row) throw new Error("INSERT folder returned no rows");
  return row;
}

export async function listFoldersForUser(
  db: DrizzleClient,
  userId: string,
  includeArchived = false,
): Promise<DbFolder[]> {
  const conds = includeArchived
    ? eq(folders.userId, userId)
    : and(eq(folders.userId, userId), eq(folders.archived, false));
  return db
    .select()
    .from(folders)
    .where(conds)
    .orderBy(desc(folders.updatedAt));
}

export async function getFolderForUser(
  db: DrizzleClient,
  folderId: string,
  userId: string,
): Promise<DbFolder | null> {
  const [row] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);
  return row ?? null;
}
