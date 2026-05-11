"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface FileItem {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  ocrStatus: "pending" | "processing" | "done" | "failed" | "skipped";
  createdAt: string;
}

interface DocumentPreviewProps {
  folderId: string;
  folderName: string;
  caseTypeLabel: string;
}

const OCR_STATUS_LABEL: Record<FileItem["ocrStatus"], string> = {
  pending: "В очереди",
  processing: "OCR…",
  done: "Готово",
  failed: "Ошибка",
  skipped: "Без OCR",
};

const OCR_STATUS_COLOR: Record<FileItem["ocrStatus"], string> = {
  pending: "var(--color-muted-foreground)",
  processing: "var(--color-accent)",
  done: "#16a34a",
  failed: "var(--color-destructive)",
  skipped: "var(--color-muted-foreground)",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Категория файла:
 *   work   — рабочие документы (Claude/юрист пишет): .md, .txt, .json, .yaml, .csv
 *   source — исходники-вложения юриста: .pdf, .docx, .doc, .jpg, .png, .webp, .audio
 *   other  — всё остальное
 */
function categorize(f: { filename: string; mime: string }): "work" | "source" | "other" {
  const lower = f.filename.toLowerCase();
  if (/\.(md|markdown|txt|json|yaml|yml|csv|log|html|xml|tex|rtf)$/.test(lower)) return "work";
  if (/\.(pdf|docx?|odt|rtf|jpe?g|png|webp|gif|bmp|tiff?|heic|svg|mp3|wav|ogg|m4a|webm)$/.test(lower)) return "source";
  return "other";
}

const fileBtnStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--color-muted-foreground)",
  textDecoration: "none",
  padding: "0.25rem 0.5rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
};

export function DocumentPreview({ folderId, folderName, caseTypeLabel }: DocumentPreviewProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState<"all" | "work" | "source">("all");
  // Inline preview: открытый файл рендерится в overlay-модал поверх правой панели
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // CSRF кэшируем — он валиден всю сессию, не дёргать на каждый refresh.
  const csrfRef = useRef<string | null>(null);
  const ensureCsrf = useCallback(async (): Promise<string> => {
    if (csrfRef.current) return csrfRef.current;
    const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    const { token } = (await res.json()) as { token: string };
    csrfRef.current = token;
    return token;
  }, []);

  const refresh = useCallback(
    async (opts?: { skipScan?: boolean; force?: boolean }) => {
      try {
        if (!opts?.skipScan) {
          const token = await ensureCsrf();
          // Force=1 — bypass server-side throttle. Если force — ждём scan
          // ПЕРЕД list-запросом, чтобы получить уже актуальный список.
          // Иначе fire-and-forget — scan не блокирует UI, увидим в следующем poll.
          const url = `/api/files/scan${opts?.force ? "?force=1" : ""}`;
          const scanP = fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "x-csrf-token": token },
            body: JSON.stringify({ folderId }),
          }).catch(() => null);
          if (opts?.force) await scanP;
        }
        const res = await fetch(`/api/files?folderId=${folderId}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { files: FileItem[] };
        setFiles(data.files);
        setError(null);
      } catch (err) {
        setError(`Сеть: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [folderId, ensureCsrf],
  );

  useEffect(() => {
    void refresh();
    // Visibility-aware polling: когда вкладка скрыта — НЕ polling'уем
    // (экономим CPU/память + сервер не получает мусор-запросы).
    let scanCounter = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval !== null) return;
      interval = setInterval(() => {
        scanCounter++;
        void refresh({ skipScan: scanCounter % 2 !== 0 });
      }, 15000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, [refresh]);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading((prev) => [...prev, { name: file.name, progress: 0 }]);
      setError(null);
      try {
        const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
        const { token } = (await csrfRes.json()) as { token: string };
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/files/upload?folderId=${folderId}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-csrf-token": token },
          body: formData,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (res.status === 409) {
            setError(`«${file.name}»: уже загружен в эту папку.`);
          } else if (res.status === 413) {
            setError(`«${file.name}»: файл слишком большой (>50 МБ).`);
          } else if (res.status === 415) {
            setError(`«${file.name}»: неподдерживаемый формат (${data.error}).`);
          } else {
            setError(`Не удалось загрузить «${file.name}»: ${data.error ?? `HTTP ${res.status}`}`);
          }
          return;
        }
        await refresh();
      } catch (err) {
        setError(`Ошибка загрузки «${file.name}»: ${(err as Error).message}`);
      } finally {
        setUploading((prev) => prev.filter((u) => u.name !== file.name));
      }
    },
    [folderId, refresh],
  );

  const onFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      // Сериально, чтобы не насиловать сервер при drop'е 10+ файлов сразу.
      for (const file of files) {
        await uploadFile(file);
      }
    },
    [uploadFile],
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void onFiles(e.dataTransfer.files);
  };

  const doDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await ensureCsrf();
      // Discriminated POST на /api/files: Next 15 dev режет DELETE/POST на dynamic [id].
      const res = await fetch(`/api/files`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "delete", id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`Не удалось удалить: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      void refresh({ skipScan: true });
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, ensureCsrf, refresh]);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
    >
      {dragOver ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "color-mix(in oklch, var(--color-accent) 8%, transparent)",
            border: "2px dashed var(--color-accent)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📂</div>
            <div style={{ fontWeight: 600 }}>Отпустите, чтобы загрузить</div>
            <div style={{ fontSize: "0.875rem", color: "var(--color-muted-foreground)" }}>
              в папку «{folderName}»
            </div>
          </div>
        </div>
      ) : null}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Документы
        </span>
        <button
          type="button"
          onClick={() => void refresh({ force: true })}
          title="Принудительно пересканировать папку (обходит throttle)"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-muted-foreground)",
            cursor: "pointer",
            padding: "0.2rem 0.45rem",
            fontSize: "0.7rem",
            borderRadius: "var(--radius-sm)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          🔄 Обновить
        </button>
      </header>

      <div
        style={{
          padding: "0.75rem",
          borderRadius: "8px",
          background: "var(--color-background)",
          border: "1px solid var(--color-border)",
          fontSize: "0.875rem",
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600 }}>{folderName}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
          {caseTypeLabel}
        </div>
        <div
          style={{
            marginTop: "0.5rem",
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
          }}
        >
          Файлов: {files.length}
        </div>
      </div>

      {files.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.25rem",
            background: "var(--color-muted)",
            borderRadius: "var(--radius-md)",
          }}
          role="tablist"
          aria-label="Фильтр документов"
        >
          {(
            [
              ["all", "Все", files.length],
              ["work", "Рабочие", files.filter((f) => categorize(f) === "work").length],
              ["source", "Исходники", files.filter((f) => categorize(f) === "source").length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              style={{
                flex: 1,
                padding: "0.35rem 0.5rem",
                fontSize: "0.75rem",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: filter === key ? "var(--color-surface)" : "transparent",
                color: filter === key ? "var(--color-foreground)" : "var(--color-muted-foreground)",
                fontWeight: filter === key ? 600 : 400,
                cursor: "pointer",
                boxShadow: filter === key ? "var(--shadow-xs)" : "none",
              }}
            >
              {label} <span style={{ opacity: 0.6 }}>{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "0.625rem",
          borderRadius: "8px",
          border: "1px dashed var(--color-border)",
          background: "transparent",
          color: "var(--color-foreground)",
          fontSize: "0.875rem",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        📎 Загрузить файл (или перетащи сюда)
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.txt"
        style={{ display: "none" }}
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error ? (
        <div
          role="alert"
          style={{
            padding: "0.5rem 0.75rem",
            background: "color-mix(in oklch, var(--color-destructive) 10%, transparent)",
            border: "1px solid color-mix(in oklch, var(--color-destructive) 40%, transparent)",
            borderRadius: "6px",
            fontSize: "0.825rem",
            color: "var(--color-destructive)",
          }}
        >
          {error}
        </div>
      ) : null}

      {uploading.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.25rem" }}>
          {uploading.map((u) => (
            <li
              key={u.name}
              style={{
                fontSize: "0.825rem",
                padding: "0.5rem 0.625rem",
                background: "var(--color-muted)",
                borderRadius: "6px",
              }}
            >
              ⏳ Загружается «{u.name}»…
            </li>
          ))}
        </ul>
      ) : null}

      {loading && files.length === 0 ? (
        <p style={{ fontSize: "0.825rem", color: "var(--color-muted-foreground)" }}>
          Загрузка списка файлов…
        </p>
      ) : files.length === 0 ? (
        <p
          style={{
            fontSize: "0.825rem",
            color: "var(--color-muted-foreground)",
            lineHeight: 1.5,
          }}
        >
          Файлов пока нет. Перетащите PDF, DOCX, JPG/PNG или TXT сюда — они привяжутся
          к этой папке. Размер до 50 МБ. Поддерживаемые форматы: pdf, docx, doc, jpg/png/webp,
          txt.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.375rem" }}>
          {(filter === "all" ? files : files.filter((f) => categorize(f) === filter)).map((f) => (
            <li
              key={f.id}
              draggable
              onDragStart={(e) => {
                // Передаём имя файла. xterm на drop отправит "@<filename> " в claude.
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("text/x-legal-ai-assistant-file", f.filename);
                e.dataTransfer.setData("text/plain", `@${f.filename} `);
              }}
              title="Перетащи в чат, чтобы Claude увидел этот файл (@-mention)"
              style={{
                padding: "0.625rem 0.75rem",
                borderRadius: "var(--radius-md)",
                background: "var(--color-background)",
                border: "1px solid var(--color-border)",
                display: "grid",
                gap: "0.4rem",
                cursor: "grab",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                  title={f.filename}
                >
                  {f.filename}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: OCR_STATUS_COLOR[f.ocrStatus],
                    flexShrink: 0,
                  }}
                >
                  {OCR_STATUS_LABEL[f.ocrStatus]}
                </div>
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--color-muted-foreground)",
                }}
              >
                {formatSize(f.sizeBytes)} · {f.mime}
              </div>
              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPreviewFile(f)}
                  style={{ ...fileBtnStyle, cursor: "pointer" }}
                  title="Открыть превью прямо в панели"
                >
                  👁 Открыть
                </button>
                <a
                  href={`/api/files/${f.id}?download=1`}
                  style={fileBtnStyle}
                  title="Скачать на диск"
                >
                  ⬇ Скачать
                </a>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(f)}
                  style={{
                    ...fileBtnStyle,
                    color: "var(--color-destructive)",
                    cursor: "pointer",
                  }}
                  title="Удалить файл из папки"
                >
                  🗑 Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Удалить файл"
        message={
          deleteTarget
            ? `Файл «${deleteTarget.filename}» будет удалён из папки и с диска. Это действие необратимо.`
            : ""
        }
        confirmLabel={deleting ? "Удаляем…" : "Удалить"}
        destructive
        onConfirm={doDelete}
        onCancel={() => (deleting ? null : setDeleteTarget(null))}
      />

      {previewFile ? (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      ) : null}
    </div>
  );
}

function PreviewModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  // Esc закрывает
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        animation: "claude-fade-in 150ms ease-out",
      }}
    >
      <div
        style={{
          width: "min(900px, 100%)",
          height: "min(85vh, 100%)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-overlay)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.625rem 1rem",
            borderBottom: "1px solid var(--color-border)",
            gap: "0.75rem",
            flexShrink: 0,
          }}
        >
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={file.filename}
            >
              {file.filename}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-muted-foreground)" }}>
              {formatSize(file.sizeBytes)} · {file.mime}
            </div>
          </div>
          <a
            href={`/api/files/${file.id}?download=1`}
            style={{
              ...fileBtnStyle,
              padding: "0.3rem 0.6rem",
            }}
            title="Скачать на диск"
          >
            ⬇ Скачать
          </a>
          <a
            href={`/api/files/${file.id}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...fileBtnStyle, padding: "0.3rem 0.6rem" }}
            title="Открыть в новой вкладке"
          >
            ↗ В новой
          </a>
          <button
            type="button"
            onClick={onClose}
            style={{ ...fileBtnStyle, padding: "0.3rem 0.6rem", cursor: "pointer" }}
            title="Закрыть (Esc)"
          >
            ✕
          </button>
        </header>
        <iframe
          src={`/api/files/${file.id}/preview`}
          title={file.filename}
          style={{
            flex: 1,
            border: "none",
            background: "var(--color-background)",
            width: "100%",
          }}
        />
      </div>
    </div>
  );
}
