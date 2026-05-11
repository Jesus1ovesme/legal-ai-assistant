"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface AppShellProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

/**
 * 3-pane shell с адаптивным layout'ом.
 *
 * Desktop (>= 900px): три ресайзящиеся колонки (folder tree | chat | documents).
 * Mobile (< 900px): только центральная панель + два drawer'а:
 *   - Левый drawer (☰ Дела) — список папок, открывается слева
 *   - Правый drawer (📄 Документы) — файлы текущей папки, открывается справа
 *   - Закрываются tap'ом на overlay или на саму кнопку
 */
export function AppShell({ left, center, right }: AppShellProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const [openRight, setOpenRight] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Закрываем drawer'ы при переключении в desktop, чтобы не залипали.
  useEffect(() => {
    if (!isMobile) {
      setOpenLeft(false);
      setOpenRight(false);
    }
  }, [isMobile]);

  if (isMobile) {
    return (
      <div style={{ position: "relative", height: "100%", width: "100%" }}>
        {/* Mobile top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 0.75rem",
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-border)",
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <button
            type="button"
            onClick={() => setOpenLeft(true)}
            style={mobileBtnStyle}
            aria-label="Открыть список дел"
          >
            ☰ Дела
          </button>
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Юрист</span>
          <button
            type="button"
            onClick={() => setOpenRight(true)}
            style={mobileBtnStyle}
            aria-label="Открыть документы"
          >
            📄 Файлы
          </button>
        </div>

        {/* Center всегда видим */}
        <section
          style={{
            height: "calc(100% - 48px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--color-background)",
          }}
        >
          {center}
        </section>

        {/* Overlay + left drawer */}
        {openLeft ? (
          <Drawer side="left" onClose={() => setOpenLeft(false)}>
            {left}
          </Drawer>
        ) : null}
        {openRight ? (
          <Drawer side="right" onClose={() => setOpenRight(false)}>
            {right}
          </Drawer>
        ) : null}
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="legal-ai-assistant-shell-v2">
      <Panel defaultSize={22} minSize={16} maxSize={36} order={1}>
        <aside
          style={{
            height: "100%",
            background: "var(--color-surface)",
            borderRight: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {left}
        </aside>
      </Panel>
      <ResizeHandle />
      <Panel defaultSize={48} minSize={28} order={2}>
        <section
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--color-background)",
          }}
        >
          {center}
        </section>
      </Panel>
      <ResizeHandle />
      <Panel defaultSize={30} minSize={16} maxSize={50} order={3}>
        <aside
          style={{
            height: "100%",
            background: "var(--color-surface)",
            borderLeft: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {right}
        </aside>
      </Panel>
    </PanelGroup>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle
      style={{
        width: "1px",
        background: "var(--color-border)",
        position: "relative",
        cursor: "col-resize",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "-3px",
          width: "7px",
        }}
      />
    </PanelResizeHandle>
  );
}

function Drawer({
  side,
  onClose,
  children,
}: {
  side: "left" | "right";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 10,
          animation: "claude-fade-in 150ms ease-out",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          [side]: 0,
          height: "100%",
          width: "min(85vw, 360px)",
          background: "var(--color-surface)",
          borderInlineEnd:
            side === "left" ? "1px solid var(--color-border)" : undefined,
          borderInlineStart:
            side === "right" ? "1px solid var(--color-border)" : undefined,
          boxShadow:
            side === "left"
              ? "8px 0 24px rgba(0,0,0,0.18)"
              : "-8px 0 24px rgba(0,0,0,0.18)",
          zIndex: 11,
          overflow: "auto",
          transform: "translateX(0)",
          animation: `claude-slide-${side} 200ms ease-out`,
        }}
      >
        {children}
      </aside>
      <style jsx global>{`
        @keyframes claude-slide-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes claude-slide-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

const mobileBtnStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-background)",
  color: "var(--color-foreground)",
  padding: "0.35rem 0.625rem",
  fontSize: "0.8rem",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
};
