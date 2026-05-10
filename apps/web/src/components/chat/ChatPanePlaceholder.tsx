"use client";

import { useState } from "react";

interface ChatPanePlaceholderProps {
  folderName: string;
  caseTypeLabel: string;
}

/**
 * Placeholder для центральной панели до Phase 2 (claude-client streaming).
 * Показывает шапку с именем дела + ChatToolbar (🧹 Очистить · 📦 Сжать · ⚙ Эффорт)
 * + composer textarea, но реального стриминга AI пока нет.
 */
export function ChatPanePlaceholder({ folderName, caseTypeLabel }: ChatPanePlaceholderProps) {
  const [text, setText] = useState("");
  const [effort, setEffort] = useState<"low" | "medium" | "high" | "max">("max");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {folderName}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "var(--color-muted-foreground)",
            }}
          >
            {caseTypeLabel}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
          <ToolbarButton title="Очистить чат (архивирует историю)">🧹 Очистить</ToolbarButton>
          <ToolbarButton title="Сжать историю (сохранит summary)">📦 Сжать</ToolbarButton>
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as typeof effort)}
            title="Уровень усилия модели"
            style={{
              padding: "0.25rem 0.5rem",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
              fontSize: "0.75rem",
            }}
          >
            <option value="low">⚙ Скорость</option>
            <option value="medium">⚙ Стандарт</option>
            <option value="high">⚙ Глубоко</option>
            <option value="max">⚙ Максимум</option>
          </select>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "2rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: "var(--color-muted-foreground)",
        }}
      >
        <div style={{ maxWidth: "440px" }}>
          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
            Чат с AI появится в Phase 2. Сейчас можно: загружать файлы (Phase 1.8d),
            переключаться между делами, видеть тип дела и применимые НПА.
          </p>
        </div>
      </div>

      <footer
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-muted)",
        }}
      >
        <textarea
          rows={3}
          placeholder="Напишите вопрос или прикрепите документ (drag&drop)…  [Phase 2]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled
          style={{
            width: "100%",
            padding: "0.625rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            background: "var(--color-background)",
            color: "var(--color-foreground)",
            fontSize: "0.95rem",
            resize: "none",
            fontFamily: "inherit",
            opacity: 0.6,
          }}
        />
      </footer>
    </div>
  );
}

function ToolbarButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "6px",
        border: "1px solid var(--color-border)",
        background: "var(--color-background)",
        color: "var(--color-foreground)",
        fontSize: "0.75rem",
        cursor: "not-allowed",
        opacity: 0.6,
      }}
    >
      {children}
    </button>
  );
}
