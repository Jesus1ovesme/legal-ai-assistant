import Link from "next/link";
import { loadAllCaseTypes } from "@/lib/case-types/loader";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const caseTypes = loadAllCaseTypes();

  return (
    <div style={{ padding: "2rem", maxWidth: "880px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>Настройки</h1>
        <p
          style={{
            margin: "0.5rem 0 0",
            color: "var(--color-muted-foreground)",
            fontSize: "0.95rem",
          }}
        >
          Параметры работы AI-помощника. Изменения system prompt применяются
          к новым папкам — старые сохраняют свои промпты на момент создания.
        </p>
      </header>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Аккаунт
        </h2>
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            background: "var(--color-muted)",
            border: "1px solid var(--color-border)",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Email:</strong> user@example.com
          </div>
          <div style={{ color: "var(--color-muted-foreground)" }}>
            Смена пароля будет добавлена в следующей фазе. Сейчас пароль зафиксирован в
            конфигурации сервера.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Типы дел ({caseTypes.length})
        </h2>
        <p
          style={{
            color: "var(--color-muted-foreground)",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          Каждый тип дела имеет специфичный system prompt, чек-лист документов и
          набор инструментов для AI. При создании папки тип определяет начальные
          параметры дела.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
          {caseTypes.map((t) => (
            <li
              key={t.key}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.75rem",
                  marginBottom: "0.25rem",
                }}
              >
                <strong style={{ fontSize: "0.95rem" }}>{t.name_ru}</strong>
                <code
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted-foreground)",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {t.key}
                </code>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.825rem",
                  color: "var(--color-muted-foreground)",
                  lineHeight: 1.5,
                }}
              >
                {t.description}
              </p>
              <details style={{ marginTop: "0.5rem" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "var(--color-muted-foreground)",
                  }}
                >
                  Применимые НПА ({t.applicable_npa.length}) ·
                  Чек-лист документов ({t.document_checklist.length})
                </summary>
                <div style={{ marginTop: "0.5rem", fontSize: "0.825rem" }}>
                  {t.applicable_npa.length > 0 ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <strong>НПА:</strong>{" "}
                      {t.applicable_npa.map((n) => n.title).join("; ")}
                    </div>
                  ) : null}
                  {t.document_checklist.length > 0 ? (
                    <div>
                      <strong>Документы:</strong>
                      <ul style={{ margin: "0.25rem 0 0 1rem" }}>
                        {t.document_checklist.map((doc, i) => (
                          <li key={i} style={{ fontSize: "0.8rem" }}>
                            {doc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Журнал действий
        </h2>
        <p
          style={{
            color: "var(--color-muted-foreground)",
            fontSize: "0.875rem",
            marginBottom: "0.5rem",
          }}
        >
          История всех действий: входы, создание дел, загрузка файлов, чат-сообщения,
          стоимость в долларах.
        </p>
        <Link
          href="/settings/audit"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            background: "var(--color-muted)",
            color: "var(--color-foreground)",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          📋 Открыть журнал
        </Link>
      </section>

      <section>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Состояние сервиса
        </h2>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontSize: "0.875rem",
            color: "var(--color-muted-foreground)",
            display: "grid",
            gap: "0.25rem",
          }}
        >
          <li>· Health: <Link href="/api/health">/api/health</Link></li>
          <li>· DB ready: <Link href="/api/ready">/api/ready</Link></li>
          <li>· Версия: 0.1.0 (Phase 1)</li>
          <li>· Транспорт Claude: API key (настройки в .env на сервере)</li>
        </ul>
      </section>
    </div>
  );
}
