import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { FolderTree } from "@/components/folder-tree/FolderTree";
import { requireSession } from "@/lib/auth/require-session";
import { getEnv } from "@/lib/env";
import { createDb, schema } from "@legal-ai-assistant/db";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Список папок без выбранной — splash с last-active делами. */
export default async function FoldersPage() {
  const auth = await requireSession();
  if (auth instanceof Response) return null;

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  // Топ-5 last-active папок + count файлов для каждой.
  const [folders, counts] = await Promise.all([
    db
      .select({
        id: schema.folders.id,
        name: schema.folders.name,
        caseType: schema.folders.caseType,
        updatedAt: schema.folders.updatedAt,
      })
      .from(schema.folders)
      .where(and(eq(schema.folders.userId, auth.userId), eq(schema.folders.archived, false)))
      .orderBy(desc(schema.folders.updatedAt))
      .limit(5),
    db
      .select({
        folderId: schema.files.folderId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.files)
      .groupBy(schema.files.folderId),
  ]);
  const countMap = new Map(counts.map((c) => [c.folderId, Number(c.count) || 0]));

  return (
    <AppShell
      left={<FolderTree />}
      center={<Splash recent={folders.map((f) => ({ ...f, fileCount: countMap.get(f.id) ?? 0 }))} />}
      right={<EmptyPreviewState />}
    />
  );
}

const CASE_TYPE_LABEL: Record<string, string> = {
  OSAGO: "ОСАГО",
  DTP: "ДТП",
  LABOR: "Трудовое",
  FAMILY: "Семейное",
  INHERITANCE: "Наследство",
  ADMIN: "Админ",
  CRIMINAL: "Уголовное",
  PROCUREMENT: "Госзакупки",
  GENERAL: "Общее",
};

function relativeTime(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} д назад`;
  return d.toLocaleDateString("ru-RU");
}

function Splash({
  recent,
}: {
  recent: Array<{
    id: string;
    name: string;
    caseType: string;
    updatedAt: Date;
    fileCount: number;
  }>;
}) {
  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "3rem 2rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "640px" }}>
        <h1
          className="serif"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: "1.75rem",
            margin: "0 0 0.5rem",
            letterSpacing: "-0.02em",
          }}
        >
          Здравствуйте
        </h1>
        <p
          style={{
            margin: "0 0 2rem",
            color: "var(--color-muted-foreground)",
            fontSize: "1rem",
          }}
        >
          Откройте недавнее дело или создайте новое.
        </p>

        {recent.length > 0 ? (
          <>
            <h2
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-muted-foreground)",
                margin: "0 0 0.75rem",
                fontWeight: 500,
              }}
            >
              Последние дела
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "grid", gap: "0.5rem" }}>
              {recent.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/folders/${f.id}`}
                    prefetch
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.75rem 1rem",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      textDecoration: "none",
                      color: "var(--color-foreground)",
                      transition: "border-color 120ms",
                    }}
                  >
                    <div style={{ overflow: "hidden", flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted-foreground)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {CASE_TYPE_LABEL[f.caseType] ?? f.caseType}
                        {f.fileCount > 0 ? ` · 📄 ${f.fileCount}` : ""} · {relativeTime(new Date(f.updatedAt))}
                      </div>
                    </div>
                    <span style={{ color: "var(--color-muted-foreground)", fontSize: "1.125rem" }}>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div
          style={{
            padding: "1.25rem",
            background: "var(--color-accent-soft)",
            border: "1px solid color-mix(in oklch, var(--color-accent) 30%, var(--color-border))",
            borderRadius: "var(--radius-md)",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
            💡 Подсказки
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.875rem", lineHeight: 1.65 }}>
            <li>
              <kbd style={kbdStyle}>Ctrl</kbd>+<kbd style={kbdStyle}>K</kbd> — быстрый поиск дела
            </li>
            <li>
              Нажмите <b>«+ Новое»</b> слева, чтобы создать дело.
            </li>
            <li>
              В каждом деле — терминал с Claude (claude-opus-4-7), документы (drag &amp; drop), MCP-tools для НПА и судпрактики.
            </li>
            <li>
              <kbd style={kbdStyle}>F11</kbd> — полноэкранный режим терминала.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EmptyPreviewState() {
  return (
    <div style={{ padding: "1rem" }}>
      <p
        style={{
          fontSize: "0.825rem",
          color: "var(--color-muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        Откройте дело слева, чтобы увидеть его документы и preview.
      </p>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  padding: "0.1rem 0.35rem",
  border: "1px solid var(--color-border)",
  borderRadius: "3px",
  background: "var(--color-surface)",
  fontFamily: "var(--font-mono)",
  margin: "0 0.1rem",
};
