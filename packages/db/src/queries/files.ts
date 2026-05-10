import { and, desc, eq } from "drizzle-orm";
import type { DrizzleClient } from "../index";
import { files, type DbFile, type NewDbFile } from "../schema/files";

export async function listFilesInFolder(
  db: DrizzleClient,
  folderId: string,
): Promise<DbFile[]> {
  return db
    .select()
    .from(files)
    .where(eq(files.folderId, folderId))
    .orderBy(desc(files.createdAt));
}

export async function getFileByName(
  db: DrizzleClient,
  folderId: string,
  filename: string,
): Promise<DbFile | null> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.filename, filename)))
    .limit(1);
  return row ?? null;
}

export async function getFileBySha(
  db: DrizzleClient,
  folderId: string,
  sha256: string,
): Promise<DbFile | null> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.sha256, sha256)))
    .limit(1);
  return row ?? null;
}

export async function insertFile(db: DrizzleClient, input: NewDbFile): Promise<DbFile> {
  const [row] = await db.insert(files).values(input).returning();
  if (!row) throw new Error("INSERT files returned no rows");
  return row;
}
