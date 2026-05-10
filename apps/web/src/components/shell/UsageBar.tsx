"use client";

import { useEffect, useState } from "react";

interface UsageData {
  // day/week могут быть null при transient-ошибке БД (см. /api/usage fail-soft).
  day: { costUsd: number; messageCount: number; tokensIn: number; tokensOut: number } | null;
  week: { costUsd: number; messageCount: number } | null;
  budget: { dayUsd: number; weekUsd: number };
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function colorForRatio(ratio: number): string {
  if (ratio < 0.5) return "var(--color-accent)";
  if (ratio < 0.8) return "#d97706"; // amber
  return "var(--color-destructive)";
}

export function UsageBar() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch("/api/usage", { credentials: "same-origin" });
        if (res.ok) setUsage((await res.json()) as UsageData);
      } catch {
        // ignore — backoff
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!usage || !usage.day || !usage.week) {
    return (
      <div style={containerStyle}>
        <span style={{ fontSize: "0.7rem", color: "var(--color-muted-foreground)" }}>…</span>
      </div>
    );
  }

  const dayRatio = Math.min(usage.day.costUsd / usage.budget.dayUsd, 1);
  const weekRatio = Math.min(usage.week.costUsd / usage.budget.weekUsd, 1);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      style={{
        ...containerStyle,
        cursor: "pointer",
        background: expanded ? "var(--color-background)" : "transparent",
      }}
      title="Расход API за день и неделю"
    >
      <Bar
        label="Сегодня"
        cost={usage.day.costUsd}
        budget={usage.budget.dayUsd}
        count={usage.day.messageCount}
        ratio={dayRatio}
      />
      <Bar
        label="Неделя"
        cost={usage.week.costUsd}
        budget={usage.budget.weekUsd}
        count={usage.week.messageCount}
        ratio={weekRatio}
      />
      {expanded ? (
        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--color-muted-foreground)",
            display: "grid",
            gap: "1px",
            paddingTop: "0.25rem",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <div>
            Tokens день: {usage.day.tokensIn.toLocaleString("ru-RU")}↓ /{" "}
            {usage.day.tokensOut.toLocaleString("ru-RU")}↑
          </div>
          <div style={{ opacity: 0.7 }}>Бюджет: ${usage.budget.dayUsd}/день · ${usage.budget.weekUsd}/нед</div>
        </div>
      ) : null}
    </button>
  );
}

function Bar({
  label,
  cost,
  budget,
  count,
  ratio,
}: {
  label: string;
  cost: number;
  budget: number;
  count: number;
  ratio: number;
}) {
  return (
    <div style={{ display: "grid", gap: "1px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.65rem",
          color: "var(--color-muted-foreground)",
        }}
      >
        <span>
          {label} · {count} {count === 1 ? "сообщ" : "сообщ"}
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace" }}>
          {formatCost(cost)} / ${budget}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "var(--color-border)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: colorForRatio(ratio),
            transition: "width 0.4s ease, background 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gap: "0.375rem",
  padding: "0.5rem 0.625rem",
  borderTop: "1px solid var(--color-border)",
  textAlign: "left",
  border: "none",
  font: "inherit",
  color: "inherit",
};
