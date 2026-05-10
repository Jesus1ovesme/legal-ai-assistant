"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

interface PromptDialogProps {
  open: boolean;
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Сохранить",
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Авто-фокус + select all
      const id = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function submit(e?: FormEvent): void {
    e?.preventDefault();
    if (value.trim()) onConfirm(value.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 200,
        backdropFilter: "blur(4px)",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "var(--color-background)",
          borderRadius: "14px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "1.25rem 1.5rem 0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{title}</h2>
        </header>
        <div style={{ padding: "0 1.5rem 1.25rem" }}>
          {label ? (
            <label
              style={{
                display: "block",
                fontSize: "0.825rem",
                color: "var(--color-muted-foreground)",
                marginBottom: "0.375rem",
              }}
            >
              {label}
            </label>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              padding: "0.625rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-muted)",
              color: "var(--color-foreground)",
              fontSize: "0.95rem",
            }}
          />
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "0.875rem 1.5rem",
            background: "var(--color-muted)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-foreground)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!value.trim() || value.trim() === initialValue}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: "var(--color-accent)",
              color: "var(--color-accent-foreground)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: !value.trim() || value.trim() === initialValue ? "not-allowed" : "pointer",
              opacity: !value.trim() || value.trim() === initialValue ? 0.5 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
