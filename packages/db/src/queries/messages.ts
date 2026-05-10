import { and, asc, eq } from "drizzle-orm";
import type { DrizzleClient } from "../index";
import { messages, type DbMessage, type NewDbMessage } from "../schema/messages";

/** Загружает активные (не archived) сообщения папки в хронологическом порядке. */
export async function listActiveMessages(
  db: DrizzleClient,
  folderId: string,
): Promise<DbMessage[]> {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.folderId, folderId), eq(messages.archived, false)))
    .orderBy(asc(messages.createdAt));
}

export async function insertMessage(
  db: DrizzleClient,
  input: NewDbMessage,
): Promise<DbMessage> {
  const [row] = await db.insert(messages).values(input).returning();
  if (!row) throw new Error("INSERT messages returned no rows");
  return row;
}

/** /clear — помечает все активные сообщения папки как archived. Возвращает число затронутых. */
export async function archiveActiveMessages(
  db: DrizzleClient,
  folderId: string,
): Promise<number> {
  const result = await db
    .update(messages)
    .set({ archived: true })
    .where(and(eq(messages.folderId, folderId), eq(messages.archived, false)))
    .returning({ id: messages.id });
  return result.length;
}
