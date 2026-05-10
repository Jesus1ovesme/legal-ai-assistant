"use client";

import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

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
        animation: "modal-fade-in 120ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
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
        <header style={{ padding: "1.25rem 1.5rem 0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{title}</h2>
        </header>
        <div
          style={{
            padding: "0.5rem 1.5rem 1.25rem",
            fontSize: "0.9rem",
            lineHeight: 1.5,
            color: "var(--color-muted-foreground)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
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
            type="button"
            onClick={onConfirm}
            autoFocus
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: destructive ? "var(--color-destructive)" : "var(--color-accent)",
              color: destructive
                ? "var(--color-destructive-foreground)"
                : "var(--color-accent-foreground)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
