"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search?.get("from") ?? "/folders";

  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "invalid_key"
            ? "Неверный ключ доступа"
            : "Ошибка входа. Попробуйте ещё раз.",
        );
        return;
      }
      router.replace(from);
      router.refresh();
    } catch (err) {
      setError(`Сеть недоступна: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--color-background)",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "2.25rem 2rem 2rem",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-md)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <header style={{ textAlign: "center" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              margin: "0 auto 0.75rem",
              borderRadius: "50%",
              background: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-accent-foreground)",
              fontFamily: "var(--font-serif)",
              fontSize: "1.4rem",
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
            aria-hidden
          >
            Ю
          </div>
          <h1
            className="serif"
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: "1.625rem",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--color-foreground)",
            }}
          >
            Юрист
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.875rem",
              color: "var(--color-muted-foreground)",
              fontWeight: 400,
            }}
          >
            AI-помощник для подготовки документов
          </p>
        </header>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <span
            style={{
              fontSize: "0.825rem",
              fontWeight: 500,
              color: "var(--color-foreground)",
            }}
          >
            Ключ доступа
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Вставьте ключ"
            style={{
              padding: "0.75rem 0.875rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
              fontSize: "0.9375rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
              transition: "border-color 120ms",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
          <span style={{ fontSize: "0.7rem", color: "var(--color-muted-foreground)" }}>
            Сессия — 14 дней.
          </span>
        </label>

        {error ? (
          <div
            role="alert"
            style={{
              padding: "0.625rem 0.875rem",
              background: "var(--color-destructive-soft)",
              border: "1px solid color-mix(in oklch, var(--color-destructive) 30%, transparent)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.825rem",
              color: "var(--color-destructive)",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !key.trim()}
          style={{
            padding: "0.75rem 0.875rem",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--color-accent)",
            color: "var(--color-accent-foreground)",
            fontSize: "0.9375rem",
            fontWeight: 500,
            cursor: submitting || !key.trim() ? "not-allowed" : "pointer",
            opacity: submitting || !key.trim() ? 0.5 : 1,
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseEnter={(e) => {
            if (!submitting && key.trim()) {
              e.currentTarget.style.background = "var(--color-accent-hover)";
            }
          }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-accent)")}
        >
          {submitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
