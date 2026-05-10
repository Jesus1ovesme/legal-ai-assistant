import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@danilurist/db";
import { CaseType, ULID_REGEX } from "@danilurist/types";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/AppShell";
import { FolderTree } from "@/components/folder-tree/FolderTree";
import { ChatPane } from "@/components/chat/ChatPane";
import { DocumentPreview } from "@/components/preview/DocumentPreview";

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  [CaseType.OSAGO]: "ОСАГО (страховое возмещение)",
  [CaseType.DTP]: "ДТП (общее, кроме ОСАГО)",
  [CaseType.LABOR]: "Трудовые споры",
  [CaseType.FAMILY]: "Семейное право",
  [CaseType.INHERITANCE]: "Наследственные дела",
  [CaseType.ADMIN]: "Административные правонарушения",
  [CaseType.CRIMINAL]: "Уголовные дела",
  [CaseType.PROCUREMENT]: "Госзакупки",
  [CaseType.GENERAL]: "Общее",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FolderPage({ params }: PageProps) {
  const { id } = await params;
  if (!ULID_REGEX.test(id)) notFound();

  const session = await getSession();
  if (!session.userId) notFound();

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  // Изолируем DB-ошибку от "folder not found": при transient-сбое pool
  // показываем fallback с retry, а не маскируем под 404 / Next-error-page.
  let folder: {
    id: string;
    name: string;
    caseType: string;
    effort: string;
  } | undefined;
  try {
    const rows = await db
      .select({
        id: schema.folders.id,
        name: schema.folders.name,
        caseType: schema.folders.caseType,
        effort: schema.folders.effort,
      })
      .from(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, session.userId)))
      .limit(1);
    folder = rows[0];
  } catch (err) {
    console.error("[folder-page] db error:", (err as Error).message);
    return (
      <AppShell
        left={<FolderTree />}
        center={
          <div style={{ padding: "2rem", color: "var(--color-muted-foreground)" }}>
            <h2 style={{ marginTop: 0 }}>База данных временно недоступна</h2>
            <p>Попробуйте обновить страницу через несколько секунд.</p>
            <a
              href={`/folders/${id}`}
              style={{ color: "var(--color-accent)", textDecoration: "underline" }}
            >
              Повторить
            </a>
          </div>
        }
        right={null}
      />
    );
  }

  if (!folder) notFound();

  const caseTypeLabel = CASE_TYPE_LABEL[folder.caseType as CaseType] ?? folder.caseType;

  return (
    <AppShell
      left={<FolderTree />}
      center={
        <ChatPane
          folderId={folder.id}
          folderName={folder.name}
          caseTypeLabel={caseTypeLabel}
        />
      }
      right={
        <DocumentPreview
          folderId={folder.id}
          folderName={folder.name}
          caseTypeLabel={caseTypeLabel}
        />
      }
    />
  );
}
