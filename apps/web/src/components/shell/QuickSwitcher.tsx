"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface FolderItem {
  id: string;
  name: string;
  caseType: string;
  fileCount?: number;
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

/**
 * Quick Switcher — Cmd/Ctrl+K. Открывает overlay с поиском по папкам.
 * Стрелки ↑↓ для навигации, Enter — перейти, Esc — закрыть.
 */
export function QuickSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K (Win/Linux) или Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Загружаем список папок при первом открытии и при каждом open=true
  // (на случай если юрист создал/удалил пока был на странице).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/folders", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = (await res.json()) as { folders: FolderItem[] };
        if (!cancelled) {
          setFolders(data.folders);
          setHighlightIdx(0);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setHighlightIdx(0);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? folders.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (CASE_TYPE_LABEL[f.caseType] ?? "").toLowerCase().includes(q),
      )
    : folders;

  const safeIdx = Math.min(highlightIdx, Math.max(filtered.length - 1, 0));

  const go = (folder: FolderItem) => {
    setOpen(false);
    router.push(`/folders/${folder.id}`);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[safeIdx];
      if (target) go(target);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        animation: "claude-fade-in 120ms ease-out",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 90vw)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-overlay)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "var(--color-muted-foreground)", fontSize: "1rem" }}>
            🔍
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIdx(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Найти дело… (↑↓ Enter)"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "1rem",
              color: "var(--color-foreground)",
            }}
            aria-label="Поиск дела"
          />
          <kbd
            style={{
              fontSize: "0.7rem",
              padding: "0.15rem 0.4rem",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-muted)",
              color: "var(--color-muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Esc
          </kbd>
        </div>
        <div style={{ maxHeight: "60vh", overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "1.5rem 1rem",
                textAlign: "center",
                color: "var(--color-muted-foreground)",
                fontSize: "0.875rem",
              }}
            >
              {q ? `Ничего не найдено по «${query}»` : "Нет дел"}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: "0.25rem" }}>
              {filtered.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => go(f)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.55rem 0.75rem",
                      border: "none",
                      background:
                        i === safeIdx ? "var(--color-accent-soft)" : "transparent",
                      color: "var(--color-foreground)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 500,
                      }}
                    >
                      {f.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--color-muted-foreground)",
                      }}
                    >
                      {CASE_TYPE_LABEL[f.caseType] ?? f.caseType}
                      {typeof f.fileCount === "number" && f.fileCount > 0
                        ? ` · 📄 ${f.fileCount}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div
          style={{
            padding: "0.5rem 1rem",
            borderTop: "1px solid var(--color-border)",
            fontSize: "0.7rem",
            color: "var(--color-muted-foreground)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{filtered.length} дел</span>
          <span>
            <kbd style={kbdStyle}>↑</kbd> <kbd style={kbdStyle}>↓</kbd> навигация ·{" "}
            <kbd style={kbdStyle}>Enter</kbd> открыть ·{" "}
            <kbd style={kbdStyle}>⌘K</kbd> закрыть
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  padding: "0.05rem 0.3rem",
  border: "1px solid var(--color-border)",
  borderRadius: "3px",
  background: "var(--color-muted)",
  fontFamily: "var(--font-mono)",
};
