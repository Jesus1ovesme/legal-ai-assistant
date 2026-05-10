"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CheckSquare,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { NewFolderDialog } from "./NewFolderDialog";
import { UsageBar } from "../shell/UsageBar";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";

interface FolderItem {
  id: string;
  name: string;
  caseType: string;
  effort: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
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

const CASE_TYPE_COLOR: Record<string, string> = {
  OSAGO: "#3b82f6",
  DTP: "#f97316",
  LABOR: "#10b981",
  FAMILY: "#ec4899",
  INHERITANCE: "#a855f7",
  ADMIN: "#64748b",
  CRIMINAL: "#dc2626",
  PROCUREMENT: "#eab308",
  GENERAL: "#94a3b8",
};

interface DialogState {
  type: "rename" | "delete-one" | "delete-bulk" | null;
  folder?: FolderItem;
  count?: number;
}

export function FolderTree() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ type: null });
  // Статусы PTY: { folderId: "running" | "idle" }. Полл каждые 5 сек.
  const [statuses, setStatuses] = useState<Record<string, "running" | "idle">>({});
  // Поиск по названию папки. Case-insensitive.
  const [search, setSearch] = useState("");
  // Сортировка: recent (default) / az / type / files. localStorage persists.
  const [sortBy, setSortBy] = useState<"recent" | "az" | "type" | "files">("recent");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("folders:sortBy");
    if (saved === "recent" || saved === "az" || saved === "type" || saved === "files") {
      setSortBy(saved);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("folders:sortBy", sortBy);
  }, [sortBy]);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/folders", { credentials: "same-origin" });
      if (!res.ok) {
        setError(`Не удалось загрузить дела (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { folders: FolderItem[] };
      setFolders(data.folders);
      setError(null);
    } catch (err) {
      setError(`Сеть недоступна: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Polling статусов: каждые 5 сек дёргаем /api/folders/status (loopback к term-server).
  useEffect(() => {
    let cancelled = false;
    const fetchStatuses = async () => {
      try {
        const res = await fetch("/api/folders/status", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          statuses: Record<string, "running" | "idle">;
        };
        if (!cancelled) setStatuses(data.statuses ?? {});
      } catch {
        // ignore — индикаторы отвалятся, не критично
      }
    };
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id !== null) return;
      void fetchStatuses();
      id = setInterval(fetchStatuses, 8000);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, []);

  async function getCsrf(): Promise<string> {
    const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    const { token } = (await res.json()) as { token: string };
    return token;
  }

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(): void {
    setSelected(new Set(folders.map((f) => f.id)));
  }

  function clearSelection(): void {
    setSelected(new Set());
    setSelectionMode(false);
  }

  async function doRename(newName: string): Promise<void> {
    const folder = dialog.folder;
    if (!folder) return;
    setDialog({ type: null });
    try {
      const token = await getCsrf();
      const res = await fetch("/api/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "rename", id: folder.id, name: newName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`Не переименовано: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    }
  }

  async function doDelete(): Promise<void> {
    const folder = dialog.folder;
    if (!folder) return;
    setDialog({ type: null });
    try {
      const token = await getCsrf();
      const res = await fetch("/api/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "delete", id: folder.id }),
      });
      if (!res.ok) {
        setError(`Не удалось удалить: HTTP ${res.status}`);
        return;
      }
      await refresh();
      if (activeId === folder.id) router.push("/folders");
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    }
  }

  async function doDeleteBulk(): Promise<void> {
    const ids = [...selected];
    setDialog({ type: null });
    if (ids.length === 0) return;
    try {
      const token = await getCsrf();
      const res = await fetch("/api/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "delete-bulk", ids }),
      });
      if (!res.ok) {
        setError(`Не удалось удалить: HTTP ${res.status}`);
        return;
      }
      const wasActive = activeId && ids.includes(activeId);
      clearSelection();
      await refresh();
      if (wasActive) router.push("/folders");
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    }
  }

  return (
    <div
      style={{
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        height: "100%",
      }}
      onClick={() => setMenuFor(null)}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.25rem 0.25rem 0.5rem",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--color-muted-foreground)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Дела {folders.length > 0 ? `· ${folders.length}` : ""}
        </span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode) clearSelection();
              else setSelectionMode(true);
            }}
            title={selectionMode ? "Выйти из режима выбора" : "Выбрать несколько"}
            style={iconBtnStyle(selectionMode)}
          >
            <CheckSquare size={15} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowNew(true);
            }}
            title="Новое дело"
            style={iconBtnStyle(false, true)}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      </header>

      {selectionMode ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.5rem 0.625rem",
            background: "color-mix(in oklch, var(--color-accent) 12%, var(--color-muted))",
            borderRadius: "8px",
            fontSize: "0.8rem",
            gap: "0.5rem",
            border: "1px solid color-mix(in oklch, var(--color-accent) 30%, transparent)",
          }}
        >
          <span style={{ fontWeight: 500 }}>
            Выбрано: <strong>{selected.size}</strong> / {folders.length}
          </span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              type="button"
              onClick={selected.size === folders.length ? () => setSelected(new Set()) : selectAll}
              style={smallBtnStyle()}
              title="Выбрать всё / снять выбор"
            >
              {selected.size === folders.length ? "Снять" : "Все"}
            </button>
            <button
              type="button"
              onClick={() => setDialog({ type: "delete-bulk", count: selected.size })}
              disabled={selected.size === 0}
              style={smallBtnStyle("destructive", selected.size === 0)}
              title={`Удалить ${selected.size} выбранных`}
            >
              <Trash2 size={12} strokeWidth={1.8} />
              <span style={{ marginLeft: "0.25rem" }}>Удалить ({selected.size})</span>
            </button>
          </div>
        </div>
      ) : null}

      {!loading && folders.length > 0 ? (
        <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.4rem" }}>
          {folders.length > 5 ? (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              style={{
                flex: 1,
                padding: "0.4rem 0.625rem",
                fontSize: "0.8125rem",
                border: "1px solid var(--color-border)",
                background: "var(--color-background)",
                color: "var(--color-foreground)",
                borderRadius: "var(--radius-md)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
            />
          ) : null}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            title="Сортировка"
            style={{
              padding: "0.4rem 0.5rem",
              fontSize: "0.75rem",
              border: "1px solid var(--color-border)",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="recent">↻ Недавние</option>
            <option value="az">А → Я</option>
            <option value="type">По типу</option>
            <option value="files">Документы</option>
          </select>
        </div>
      ) : null}
      {loading ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted-foreground)", padding: "0.5rem" }}>
          Загрузка…
        </p>
      ) : error ? (
        <p
          role="alert"
          style={{
            fontSize: "0.825rem",
            color: "var(--color-destructive)",
            padding: "0.5rem 0.625rem",
            background: "color-mix(in oklch, var(--color-destructive) 8%, transparent)",
            border: "1px solid color-mix(in oklch, var(--color-destructive) 25%, transparent)",
            borderRadius: "6px",
          }}
        >
          {error}
        </p>
      ) : folders.length === 0 ? (
        <p style={{ fontSize: "0.825rem", color: "var(--color-muted-foreground)", padding: "0.5rem" }}>
          Дел пока нет. Создайте первое.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            flex: 1,
            overflow: "auto",
          }}
        >
          {(() => {
            const q = search.trim().toLowerCase();
            const filtered = q
              ? folders.filter(
                  (f) =>
                    f.name.toLowerCase().includes(q) ||
                    (CASE_TYPE_LABEL[f.caseType] ?? "").toLowerCase().includes(q),
                )
              : folders;
            const visible = [...filtered].sort((a, b) => {
              switch (sortBy) {
                case "az":
                  return a.name.localeCompare(b.name, "ru");
                case "type": {
                  const aLabel = CASE_TYPE_LABEL[a.caseType] ?? a.caseType;
                  const bLabel = CASE_TYPE_LABEL[b.caseType] ?? b.caseType;
                  return aLabel.localeCompare(bLabel, "ru") || a.name.localeCompare(b.name, "ru");
                }
                case "files":
                  return (b.fileCount ?? 0) - (a.fileCount ?? 0);
                case "recent":
                default:
                  return (
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                  );
              }
            });
            if (visible.length === 0 && q) {
              return (
                <li
                  style={{
                    padding: "1rem",
                    fontSize: "0.825rem",
                    color: "var(--color-muted-foreground)",
                    textAlign: "center",
                  }}
                >
                  Ничего не найдено по «{search}»
                </li>
              );
            }
            return visible.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                active={activeId === f.id}
                status={statuses[f.id]}
                selected={selected.has(f.id)}
                selectionMode={selectionMode}
                menuOpen={menuFor === f.id}
                onMenuToggle={() => setMenuFor(menuFor === f.id ? null : f.id)}
                onCheckToggle={() => toggleSelected(f.id)}
                onRename={() => {
                  setDialog({ type: "rename", folder: f });
                  setMenuFor(null);
                }}
                onDelete={() => {
                  setDialog({ type: "delete-one", folder: f });
                  setMenuFor(null);
                }}
              />
            ));
          })()}
        </ul>
      )}

      <div style={{ marginTop: "auto" }}>
        <UsageBar />
      </div>

      {showNew ? (
        <NewFolderDialog
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      ) : null}

      <PromptDialog
        open={dialog.type === "rename"}
        title="Переименовать дело"
        label="Новое название"
        initialValue={dialog.folder?.name ?? ""}
        confirmLabel="Переименовать"
        onConfirm={doRename}
        onCancel={() => setDialog({ type: null })}
      />

      <ConfirmDialog
        open={dialog.type === "delete-one"}
        title="Удалить дело"
        message={
          dialog.folder
            ? `Дело «${dialog.folder.name}» переедет в архив. Файлы и история скроются, но восстановимы из БД.`
            : ""
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={doDelete}
        onCancel={() => setDialog({ type: null })}
      />

      <ConfirmDialog
        open={dialog.type === "delete-bulk"}
        title={`Удалить ${dialog.count ?? 0} ${pluralCases(dialog.count ?? 0)}`}
        message="Все выбранные дела отправятся в архив. Файлы и история скроются, но восстановимы из БД."
        confirmLabel={`Удалить ${dialog.count ?? 0}`}
        destructive
        onConfirm={doDeleteBulk}
        onCancel={() => setDialog({ type: null })}
      />
    </div>
  );
}

function FolderRow({
  folder,
  active,
  selected,
  selectionMode,
  menuOpen,
  onMenuToggle,
  onCheckToggle,
  onRename,
  onDelete,
}: {
  folder: FolderItem;
  active: boolean;
  status?: "running" | "idle";
  selected: boolean;
  selectionMode: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onCheckToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const caseColor = CASE_TYPE_COLOR[folder.caseType] ?? "#94a3b8";
  const label = CASE_TYPE_LABEL[folder.caseType] ?? folder.caseType;
  // Status-точка: зелёная мигающая = живая PTY с клиентом, жёлтая = idle PTY
  // (висит без клиента), null = нет активной сессии → показываем case-type цвет.
  const statusColor =
    status === "running" ? "#10b981" : status === "idle" ? "#eab308" : null;
  const dotColor = statusColor ?? caseColor;
  const dotPulse = status === "running";

  const inner = (
    <>
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onCheckToggle}
          onClick={(e) => e.stopPropagation()}
          style={{
            margin: 0,
            width: "16px",
            height: "16px",
            cursor: "pointer",
            accentColor: "var(--color-accent)",
            marginTop: "0.2rem",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          title={
            status === "running"
              ? "Сессия активна"
              : status === "idle"
                ? "Сессия в idle"
                : label
          }
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            marginTop: "0.5rem",
            animation: dotPulse ? "claude-pulse 1.2s ease-in-out infinite" : undefined,
            boxShadow: status === "running" ? "0 0 6px #10b98180" : undefined,
          }}
          aria-hidden
        />
      )}
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div
          style={{
            fontWeight: active && !selectionMode ? 600 : 400,
            color:
              active && !selectionMode
                ? "var(--color-accent-foreground)"
                : "var(--color-foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.875rem",
            lineHeight: 1.35,
          }}
        >
          {folder.name}
        </div>
        <div
          style={{
            fontSize: "0.7rem",
            color:
              active && !selectionMode
                ? "var(--color-accent-foreground)"
                : "var(--color-muted-foreground)",
            opacity: active && !selectionMode ? 0.85 : 1,
          }}
        >
          {label}
          {typeof folder.fileCount === "number" && folder.fileCount > 0 ? (
            <span style={{ marginLeft: "0.4rem", opacity: 0.7 }}>
              · 📄 {folder.fileCount}
            </span>
          ) : null}
        </div>
      </div>
      {!selectionMode ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuToggle();
          }}
          aria-label="Действия"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            padding: "0.25rem",
            opacity: 0.5,
            flexShrink: 0,
            borderRadius: "4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.7} />
        </button>
      ) : null}
    </>
  );

  const rowBaseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.5rem 0.625rem",
    borderRadius: "8px",
    textDecoration: "none",
    color: "var(--color-foreground)",
    background:
      active && !selectionMode
        ? "var(--color-accent)"
        : selected
          ? "color-mix(in oklch, var(--color-accent) 14%, transparent)"
          : "transparent",
    transition: "background 0.12s",
    cursor: selectionMode ? "pointer" : undefined,
  };

  return (
    <li style={{ position: "relative" }}>
      {selectionMode ? (
        <div onClick={onCheckToggle} style={rowBaseStyle}>
          {inner}
        </div>
      ) : (
        <Link href={`/folders/${folder.id}`} prefetch style={rowBaseStyle}>
          {inner}
        </Link>
      )}
      {menuOpen ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: "0.25rem",
            top: "100%",
            zIndex: 5,
            background: "var(--color-background)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontSize: "0.825rem",
            minWidth: "160px",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={onRename}
            style={menuBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Pencil size={13} strokeWidth={1.7} />
            <span>Переименовать</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{ ...menuBtn, color: "var(--color-destructive)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-destructive-soft)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Trash2 size={13} strokeWidth={1.7} />
            <span>Удалить</span>
          </button>
        </div>
      ) : null}
    </li>
  );
}

function pluralCases(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "дело";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дела";
  return "дел";
}

function iconBtnStyle(active: boolean, primary = false): React.CSSProperties {
  return {
    width: "30px",
    height: "30px",
    border:
      active || primary
        ? "1px solid var(--color-accent)"
        : "1px solid var(--color-border)",
    background: active || primary ? "var(--color-accent)" : "transparent",
    color: active || primary ? "var(--color-accent-foreground)" : "var(--color-muted-foreground)",
    cursor: "pointer",
    borderRadius: "8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    boxShadow: primary ? "var(--shadow-xs)" : "none",
  };
}

function smallBtnStyle(
  variant: "default" | "destructive" = "default",
  disabled = false,
): React.CSSProperties {
  return {
    padding: "0.25rem 0.5rem",
    borderRadius: "5px",
    border:
      variant === "destructive"
        ? "1px solid color-mix(in oklch, var(--color-destructive) 50%, transparent)"
        : "1px solid var(--color-border)",
    background: "var(--color-background)",
    color: variant === "destructive" ? "var(--color-destructive)" : "var(--color-foreground)",
    fontSize: "0.7rem",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const menuBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  fontSize: "0.8rem",
  transition: "background 0.1s",
};
