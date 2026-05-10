"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
          const { token } = (await csrfRes.json()) as { token: string };
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: { "x-csrf-token": token },
          });
        } catch {
          /* всё равно перебрасываем на /login: cookie очистится при логине */
        }
        window.location.href = "/login";
      }}
      style={{
        border: "none",
        background: "transparent",
        color: "var(--color-muted-foreground)",
        cursor: "pointer",
        padding: "0.4rem 0.625rem",
        borderRadius: "var(--radius-md)",
        fontSize: "0.875rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-muted)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <LogOut size={15} strokeWidth={1.7} />
      Выйти
    </button>
  );
}
