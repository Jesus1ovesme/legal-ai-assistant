import type { ReactNode } from "react";
import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { QuickSwitcher } from "@/components/shell/QuickSwitcher";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * 3-pane shell приложения. **Phase 1.8c**: пока минимальный layout с заголовком и
 * основным контентом. FolderTree | Chat | Preview добавим в следующей итерации.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
        background: "var(--color-background)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.625rem 1.5rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          backdropFilter: "saturate(180%) blur(20px)",
        }}
      >
        <Link
          href="/folders"
          className="serif"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            color: "var(--color-foreground)",
            textDecoration: "none",
            fontSize: "1.0625rem",
            letterSpacing: "-0.015em",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "var(--color-accent)",
            }}
          />
          Юрист
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              fontSize: "0.825rem",
              color: "var(--color-muted-foreground)",
              marginLeft: "0.25rem",
            }}
          >
            · AI-помощник
          </span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem" }}>
          <span
            title="Ctrl+K — быстрый поиск дела"
            style={{
              fontSize: "0.7rem",
              padding: "0.25rem 0.5rem",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-muted-foreground)",
              fontFamily: "var(--font-mono)",
              marginRight: "0.4rem",
              userSelect: "none",
            }}
          >
            ⌘K
          </span>
          <Link
            href="/settings"
            style={{
              color: "var(--color-muted-foreground)",
              textDecoration: "none",
              padding: "0.4rem 0.625rem",
              borderRadius: "var(--radius-md)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              transition: "background 120ms",
            }}
          >
            <SettingsIcon size={15} strokeWidth={1.7} />
            Настройки
          </Link>
          <LogoutButton />
        </nav>
      </header>
      <main style={{ overflow: "hidden" }}>{children}</main>
      <QuickSwitcher />
    </div>
  );
}
