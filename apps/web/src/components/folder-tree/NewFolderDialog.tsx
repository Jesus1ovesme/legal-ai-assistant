"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface CaseTypeOption {
  key: string;
  name_ru: string;
  description: string;
  document_checklist: string[];
}

interface NewFolderDialogProps {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

export function NewFolderDialog({ onClose, onCreated }: NewFolderDialogProps) {
  const router = useRouter();
  const [types, setTypes] = useState<CaseTypeOption[]>([]);
  const [name, setName] = useState("");
  const [caseType, setCaseType] = useState<string>("OSAGO");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/case-types", { credentials: "same-origin" });
        if (!res.ok) {
          setError(`Не удалось загрузить типы дел (HTTP ${res.status})`);
          return;
        }
        const data = (await res.json()) as { types: CaseTypeOption[] };
        if (!cancelled) setTypes(data.types);
      } catch (err) {
        if (!cancelled) setError(`Сеть недоступна: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { token } = (await csrfRes.json()) as { token: string };
      const res = await fetch("/api/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ name: name.trim(), caseType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`Не удалось создать дело: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      await onCreated();
      router.push(`/folders/${id}`);
    } catch (err) {
      setError(`Сеть недоступна: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const selected = types.find((t) => t.key === caseType);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          padding: "1.5rem",
          background: "var(--color-background)",
          color: "var(--color-foreground)",
          borderRadius: "12px",
          boxShadow: "0 12px 48px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <header>
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Новое дело</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--color-muted-foreground)" }}>
            Тип определяет промпт для AI и чек-лист документов.
          </p>
        </header>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.875rem" }}>Название</span>
          <input
            type="text"
            required
            autoFocus
            placeholder="Например: ОСАГО претензия Иванов"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            style={{
              padding: "0.625rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
              fontSize: "0.95rem",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.875rem" }}>Тип дела</span>
          <select
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            style={{
              padding: "0.625rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
              fontSize: "0.95rem",
            }}
          >
            {types.length === 0 ? (
              <option value="OSAGO">Загрузка…</option>
            ) : (
              types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name_ru}
                </option>
              ))
            )}
          </select>
        </label>

        {selected ? (
          <div
            style={{
              padding: "0.75rem 0.875rem",
              borderRadius: "8px",
              background: "var(--color-muted)",
              fontSize: "0.825rem",
              color: "var(--color-muted-foreground)",
              lineHeight: 1.5,
            }}
          >
            <div style={{ marginBottom: "0.5rem" }}>{selected.description}</div>
            {selected.document_checklist.length > 0 ? (
              <details>
                <summary style={{ cursor: "pointer", fontSize: "0.75rem" }}>
                  Что обычно нужно ({selected.document_checklist.length} документов)
                </summary>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                  {selected.document_checklist.slice(0, 8).map((doc, i) => (
                    <li key={i} style={{ fontSize: "0.75rem" }}>
                      {doc}
                    </li>
                  ))}
                  {selected.document_checklist.length > 8 ? (
                    <li style={{ fontSize: "0.75rem", fontStyle: "italic" }}>
                      …и ещё {selected.document_checklist.length - 8}
                    </li>
                  ) : null}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            style={{
              padding: "0.5rem 0.75rem",
              background: "color-mix(in oklch, var(--color-destructive) 12%, transparent)",
              border: "1px solid color-mix(in oklch, var(--color-destructive) 50%, transparent)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              color: "var(--color-destructive)",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-foreground)",
              fontSize: "0.875rem",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: "var(--color-accent)",
              color: "var(--color-accent-foreground)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: submitting || !name.trim() ? "not-allowed" : "pointer",
              opacity: submitting || !name.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? "Создаём…" : "Создать"}
          </button>
        </div>
      </form>
    </div>
  );
}
