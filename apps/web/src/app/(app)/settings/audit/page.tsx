import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { createDb, schema } from "@danilurist/db";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_OK: "✅ Вход",
  LOGIN_FAIL: "❌ Неверный ключ",
  LOGOUT: "👋 Выход",
  FOLDER_CREATE: "📁 Создано дело",
  FOLDER_ARCHIVE: "🗑 Дело в архив",
  FILE_UPLOAD: "📎 Файл загружен",
  FILE_DELETE: "🗑 Файл удалён",
  CHAT_SEND: "💬 Сообщение в чат",
  CHAT_CLEAR: "🧹 Чат очищен",
  CHAT_COMPACT: "📦 Чат сжат",
  EXPORT_DOCX: "📄 Экспорт .docx",
  STT_TRANSCRIBE: "🎙 Транскрипция",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

export default async function AuditPage() {
  const session = await getSession();
  if (!session.userId) return null;

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      folderId: schema.auditLog.folderId,
      model: schema.auditLog.model,
      effort: schema.auditLog.effort,
      latencyMs: schema.auditLog.latencyMs,
      costUsd: schema.auditLog.costEstimateUsd,
      payload: schema.auditLog.payload,
      ip: schema.auditLog.ip,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, session.userId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200);

  return (
    <div style={{ padding: "2rem", maxWidth: "960px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/settings"
          style={{
            fontSize: "0.825rem",
            color: "var(--color-muted-foreground)",
            textDecoration: "none",
          }}
        >
          ← Настройки
        </Link>
        <h1 style={{ margin: "0.5rem 0 0", fontSize: "1.75rem", fontWeight: 600 }}>
          Журнал действий
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0",
            color: "var(--color-muted-foreground)",
            fontSize: "0.875rem",
          }}
        >
          Последние 200 записей. Хранится: дата, действие, дело (если применимо), модель,
          стоимость в $, длительность, IP. Содержимое сообщений не дублируется — оно в чате.
        </p>
      </header>

      <table
        style={{
          width: "100%",
          fontSize: "0.825rem",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr
            style={{
              background: "var(--color-muted)",
              color: "var(--color-muted-foreground)",
            }}
          >
            <th style={th}>Время</th>
            <th style={th}>Действие</th>
            <th style={th}>Модель</th>
            <th style={{ ...th, textAlign: "right" }}>Latency</th>
            <th style={{ ...th, textAlign: "right" }}>$</th>
            <th style={th}>Детали</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id.toString()} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td style={tdMono}>{formatDate(r.createdAt)}</td>
              <td style={td}>{ACTION_LABELS[r.action] ?? r.action}</td>
              <td style={tdMono}>{r.model ?? "—"}</td>
              <td style={{ ...tdMono, textAlign: "right" }}>
                {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
              </td>
              <td style={{ ...tdMono, textAlign: "right" }}>
                {r.costUsd ? `$${parseFloat(r.costUsd).toFixed(4)}` : "—"}
              </td>
              <td style={{ ...td, fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
                {r.folderId ? `folder=${r.folderId.slice(0, 10)}…` : ""}
                {r.payload ? ` ${JSON.stringify(r.payload).slice(0, 80)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--color-muted-foreground)",
          }}
        >
          Пока никаких действий не зафиксировано.
        </p>
      ) : null}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontWeight: 600,
  borderBottom: "1px solid var(--color-border)",
};
const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  verticalAlign: "top",
};
const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.75rem",
};
