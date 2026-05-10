"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Eraser,
  Archive,
  Send,
  Square,
  Brain,
  Wrench,
  FileText,
  Copy,
  ArrowDown,
} from "lucide-react";
import { VoiceButton } from "./VoiceButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { XTermView } from "./XTermView";
import {
  abortStream,
  enqueueMessage,
  getQueue,
  getSnapshot,
  removeFromQueue,
  subscribe,
  type StreamSnapshot,
  type QueuedMessage,
} from "../../stores/chat-stream-store";

type Effort = "low" | "medium" | "high" | "max";
// По требованию пользователя: всегда max/opus/ultrathink. UI-селектор скрыт.
const EFFORT_LABEL: Record<Effort, string> = {
  low: "Максимум · opus",
  medium: "Максимум · opus",
  high: "Максимум · opus",
  max: "Максимум · opus",
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  pending?: boolean;
  thinking?: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
}

interface ChatPaneProps {
  folderId: string;
  folderName: string;
  caseTypeLabel: string;
}

export function ChatPane({ folderId, folderName, caseTypeLabel }: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Effort всегда стартует с "max" чтобы избежать hydration mismatch (SSR vs client).
  // Реальное значение из localStorage применяется в useEffect после mount.
  const [effort, setEffort] = useState<Effort>("max");
  const [hydrated, setHydrated] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<"clear" | "compact" | null>(null);
  // Режим: pty (настоящий xterm + claude TUI) или bubble (markdown chat).
  const [viewMode, setViewMode] = useState<"bubble" | "pty">("pty");
  const listRef = useRef<HTMLDivElement>(null);
  // Счётчик подряд идущих 5xx/network-fails в refresh — для auto-retry без
  // паники в виде красного баннера на холодный старт PG pool.
  const refreshFailRef = useRef(0);

  // Стрим живёт в глобальном store по folderId — переживает unmount при переключении папок.
  const stream: StreamSnapshot = useSyncExternalStore(
    useCallback((cb) => subscribe(folderId, cb), [folderId]),
    useCallback(() => getSnapshot(folderId), [folderId]),
    () => getSnapshot(folderId),
  );
  // Очередь сообщений (можешь печатать во время стрима — встанут в очередь)
  const queueDeps = stream.version; // re-read при каждом изменении store
  const queue: QueuedMessage[] = (() => {
    void queueDeps;
    return getQueue(folderId);
  })();
  const streaming = stream.status === "streaming";
  const thinking = stream.isThinkingPhase;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(`effort:${folderId}`) as Effort | null;
    if (saved && ["low", "medium", "high", "max"].includes(saved)) {
      setEffort(saved);
    }
    const savedView = window.localStorage.getItem("chat:viewMode");
    // Миграция: старый "terminal" режим (имитация SSE) удалён → форсим pty.
    if (savedView === "terminal") {
      window.localStorage.setItem("chat:viewMode", "pty");
      setViewMode("pty");
    } else if (savedView === "bubble" || savedView === "pty") {
      setViewMode(savedView);
    }
    setHydrated(true);
  }, [folderId]);

  useEffect(() => {
    if (hydrated && typeof window !== "undefined") {
      window.localStorage.setItem("chat:viewMode", viewMode);
    }
  }, [viewMode, hydrated]);

  useEffect(() => {
    if (hydrated && typeof window !== "undefined") {
      window.localStorage.setItem(`effort:${folderId}`, effort);
    }
  }, [effort, folderId, hydrated]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/messages?folderId=${folderId}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        // 4xx — не транзиентно (auth/validation), показываем сразу.
        // 5xx — может быть холодный pool / транзиент: 3 попытки тихо, потом баннер.
        if (res.status >= 500 && refreshFailRef.current < 3) {
          refreshFailRef.current += 1;
          setTimeout(() => void refresh(), 1500 * refreshFailRef.current);
          return;
        }
        refreshFailRef.current = 0;
        setError(`Не удалось загрузить историю (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { messages: ChatMessage[] };
      setMessages(data.messages);
      setError(null);
      refreshFailRef.current = 0;
    } catch (err) {
      // Network throw — тоже транзиент (DNS hiccup / offline).
      if (refreshFailRef.current < 3) {
        refreshFailRef.current += 1;
        setTimeout(() => void refresh(), 1500 * refreshFailRef.current);
        return;
      }
      refreshFailRef.current = 0;
      setError(`Сеть недоступна: ${(err as Error).message}`);
    }
  }, [folderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-polling сообщений нужен только в bubble-режиме (там показываем историю).
  // В pty-режиме chat не используется → polling выключен → меньше нагрузки.
  // Когда стримим — тоже не нужен (snapshot обновляется через store).
  useEffect(() => {
    if (streaming || viewMode === "pty") return;
    const id = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(id);
  }, [streaming, refresh, viewMode]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e?: FormEvent<HTMLFormElement>): Promise<void> {
    e?.preventDefault();
    const content = input.trim();
    if (!content) return;
    setError(null);
    setInput("");

    // Если стрим активен — встанем в очередь, иначе сразу запустим.
    enqueueMessage({
      folderId,
      content,
      effort,
      onAppendUserMessage: (msg) => {
        setMessages((prev) => [
          ...prev,
          { id: msg.id, role: "user", content: msg.content, createdAt: msg.createdAt, pending: true },
        ]);
      },
      onFinish: () => {
        void refresh();
      },
    });
  }

  function abort(): void {
    // Прерываем текущий стрим И чистим очередь — если хочешь только остановить
    // текущий и оставить очередь, поменяй на abortStream(folderId, { keepQueue: true }).
    abortStream(folderId);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter — отправить, Shift+Enter — перенос строки.
    // Не реагируем на IME composition (китайский/японский ввод).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  async function doClearChat(): Promise<void> {
    setPendingDialog(null);
    try {
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { token } = (await csrfRes.json()) as { token: string };
      const res = await fetch(`/api/chat/clear?folderId=${folderId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": token },
      });
      if (res.ok) await refresh();
      else setError(`Не удалось очистить: HTTP ${res.status}`);
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    }
  }

  async function doCompactChat(): Promise<void> {
    setPendingDialog(null);
    setError(null);
    try {
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { token } = (await csrfRes.json()) as { token: string };
      const res = await fetch(`/api/chat/compact?folderId=${folderId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": token },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        archivedCount?: number;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        await refresh();
      } else {
        setError(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(`Сеть: ${(err as Error).message}`);
    }
  }

  // Ошибки стрима пробрасываем в локальный state ровно один раз на смену.
  useEffect(() => {
    if (stream.error) setError(stream.error);
  }, [stream.error]);

  // Объединяем сообщения из БД и активный стрим (живой assistant + pending user).
  const liveMessages: ChatMessage[] = [...messages];
  if (stream.status !== "idle") {
    if (!liveMessages.some((m) => m.id === stream.userTempId)) {
      liveMessages.push({
        id: stream.userTempId,
        role: "user",
        content: stream.userContent,
        createdAt: new Date(stream.startedAt).toISOString(),
        pending: true,
      });
    }
    liveMessages.push({
      id: stream.assistantTempId || "live-assistant",
      role: "assistant",
      content: stream.contentText,
      createdAt: new Date(stream.startedAt).toISOString(),
      pending: stream.status === "streaming",
      thinking: stream.thinkingText || undefined,
      toolCalls: stream.toolCalls,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          padding: "0.875rem 1.25rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexShrink: 0,
          background: "var(--color-surface)",
        }}
      >
        <div style={{ overflow: "hidden", flex: 1 }}>
          <h2
            className="serif"
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: "1.0625rem",
              fontWeight: 500,
              letterSpacing: "-0.015em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {folderName}
          </h2>
          <p
            style={{
              margin: "0.125rem 0 0",
              fontSize: "0.75rem",
              color: "var(--color-muted-foreground)",
            }}
          >
            {caseTypeLabel}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}>
          <span
            title="Всегда максимальный режим: opus-4-7 + extended thinking + все инструменты"
            style={{
              padding: "0.35rem 0.625rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid color-mix(in oklch, var(--color-accent) 30%, var(--color-border))",
              background: "var(--color-accent-soft)",
              color: "var(--color-accent)",
              fontSize: "0.7rem",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              userSelect: "none",
            }}
          >
            💎 Максимум · opus
          </span>
          <ToolbarBtn
            onClick={() => setViewMode((v) => (v === "pty" ? "bubble" : "pty"))}
            title={viewMode === "pty" ? "Переключить в режим чата" : "Переключить в режим терминала"}
          >
            {viewMode === "pty" ? "💬 Чат" : "▮ Терминал"}
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setPendingDialog("clear")} title="Очистить историю чата">
            <Eraser size={13} strokeWidth={1.7} /> Очистить
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => setPendingDialog("compact")}
            title="Сжать историю в summary"
          >
            <Archive size={13} strokeWidth={1.7} /> Сжать
          </ToolbarBtn>
        </div>
      </header>

      {viewMode === "pty" ? (
        <XTermView folderId={folderId} active={true} />
      ) : (
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {liveMessages.length === 0 && !streaming ? (
          <div
            style={{
              margin: "auto",
              maxWidth: "480px",
              textAlign: "center",
              color: "var(--color-muted-foreground)",
              padding: "2rem 1rem",
            }}
          >
            <div
              aria-hidden
              style={{
                width: "44px",
                height: "44px",
                margin: "0 auto 1rem",
                borderRadius: "50%",
                background: "var(--color-accent-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-accent)",
              }}
            >
              <ArrowDown size={20} strokeWidth={1.7} />
            </div>
            <p
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              Задайте вопрос. Например: «Помоги составить претензию по ОСАГО».
              Загрузите документы в правую панель — AI прочитает их, проверит
              применимые НПА и судебную практику ВС РФ.
            </p>
          </div>
        ) : (
          liveMessages.map((m) => <Message key={m.id} message={m} />)
        )}
        {streaming ? (
          <ProgressIndicator
            elapsedMs={stream.liveElapsedMs}
            outputTokens={stream.liveOutputTokens}
            inputTokens={stream.progress?.inputTokens ?? 0}
            cacheReadTokens={stream.progress?.cacheReadTokens ?? 0}
            thinkingMs={stream.progress?.thinkingMs ?? 0}
            toolCount={stream.toolCalls.length}
            activity={stream.progress?.activity ?? "init"}
            thinking={thinking}
            previewThinking={stream.thinkingText}
            previewContent={stream.contentText}
            currentTool={
              stream.lastToolAt > stream.lastTextAt
                ? (stream.toolCalls[stream.toolCalls.length - 1]?.name ?? null)
                : null
            }
            phase={
              stream.lastToolAt > stream.lastTextAt && stream.lastToolAt > 0
                ? "tool"
                : stream.lastTextAt > 0 && stream.lastTextAt >= stream.lastThinkingAt
                  ? "writing"
                  : "thinking"
            }
          />
        ) : null}
      </div>
      )}

      {error ? (
        <div
          role="alert"
          style={{
            margin: "0 1rem 0.5rem",
            padding: "0.5rem 0.75rem",
            background: "color-mix(in oklch, var(--color-destructive) 10%, transparent)",
            border: "1px solid color-mix(in oklch, var(--color-destructive) 40%, transparent)",
            borderRadius: "8px",
            fontSize: "0.825rem",
            color: "var(--color-destructive)",
          }}
        >
          {error}
        </div>
      ) : null}

      {viewMode === "pty" ? null : (
      <form
        onSubmit={send}
        style={{
          padding: "0.875rem 1.25rem 1rem",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        {queue.length > 0 ? (
          <div
            style={{
              marginBottom: "0.4rem",
              padding: "0.4rem 0.625rem",
              fontSize: "0.75rem",
              background: "var(--color-accent-soft)",
              border: "1px solid color-mix(in oklch, var(--color-accent) 25%, var(--color-border))",
              borderRadius: "var(--radius-md)",
              color: "var(--color-foreground)",
            }}
          >
            <div
              style={{
                fontWeight: 500,
                marginBottom: "0.25rem",
                color: "var(--color-accent)",
              }}
            >
              В очереди: {queue.length}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.25rem" }}>
              {queue.map((q) => (
                <li
                  key={q.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.3rem 0.5rem",
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--color-muted-foreground)",
                    }}
                    title={q.content}
                  >
                    {q.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(folderId, q.id)}
                    title="Убрать из очереди"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--color-destructive)",
                      fontSize: "0.85rem",
                      padding: "0 0.25rem",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <textarea
          rows={3}
          placeholder={
            streaming
              ? "Печатай — встанет в очередь и отправится после ответа. Enter — отправить."
              : "Напишите вопрос…  Enter — отправить, Shift+Enter — новая строка"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            width: "100%",
            padding: "0.75rem 0.875rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-background)",
            color: "var(--color-foreground)",
            fontSize: "0.9375rem",
            lineHeight: 1.55,
            resize: "vertical",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 120ms",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "0.5rem",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <VoiceButton
              disabled={streaming}
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              onError={(msg) => setError(msg)}
            />
            <span style={{ fontSize: "0.7rem", color: "var(--color-muted-foreground)" }}>
              Через Claude Max · {EFFORT_LABEL[effort]}
            </span>
          </div>
          <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
          {streaming ? (
            <button
              type="button"
              onClick={abort}
              title="Прервать текущий ответ и очистить очередь"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-destructive)",
                fontSize: "0.875rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontWeight: 500,
              }}
            >
              <Square size={13} strokeWidth={2} fill="currentColor" /> Прервать
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!input.trim()}
            title={
              streaming
                ? "Поставить в очередь — отправится после текущего ответа"
                : "Отправить сообщение"
            }
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--color-accent)",
              color: "var(--color-accent-foreground)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: !input.trim() ? "not-allowed" : "pointer",
              opacity: !input.trim() ? 0.4 : 1,
              boxShadow: !input.trim() ? "none" : "var(--shadow-xs)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
            onMouseEnter={(e) => {
              if (input.trim()) e.currentTarget.style.background = "var(--color-accent-hover)";
            }}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--color-accent)")
            }
          >
            <Send size={13} strokeWidth={1.8} /> {streaming ? "В очередь" : "Отправить"}
          </button>
          </div>
        </div>
      </form>
      )}

      <ConfirmDialog
        open={pendingDialog === "clear"}
        title="Очистить чат"
        message="История диалога скроется (можно восстановить через журнал действий). Файлы и system prompt останутся."
        confirmLabel="Очистить"
        destructive
        onConfirm={doClearChat}
        onCancel={() => setPendingDialog(null)}
      />

      <ConfirmDialog
        open={pendingDialog === "compact"}
        title="Сжать историю"
        message="AI создаст краткий summary всего диалога (~500 слов) и заменит им полную историю. Старые сообщения архивируются. Стоит делать когда диалог становится длинным."
        confirmLabel="Сжать"
        onConfirm={doCompactChat}
        onCancel={() => setPendingDialog(null)}
      />
    </div>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  init: "Запуск…",
  thinking: "Размышляет",
  writing: "Печатает ответ",
  processing: "Обрабатывает результат",
  done: "Завершает",
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return "0с";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return `${min}м ${s.toString().padStart(2, "0")}с`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}ч ${m}м`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

interface ProgressIndicatorProps {
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  thinkingMs: number;
  toolCount: number;
  activity: string;
  thinking: boolean;
  previewThinking: string;
  previewContent: string;
  currentTool: string | null;
  phase: "thinking" | "tool" | "writing";
}

const TOOL_LABEL: Record<string, string> = {
  WebSearch: "Ищет в интернете",
  WebFetch: "Читает страницу",
  Read: "Читает файл",
  Write: "Пишет файл",
  Edit: "Редактирует файл",
  Glob: "Ищет файлы",
  Grep: "Ищет по тексту",
  LS: "Смотрит папку",
  Bash: "Запускает команду",
};

// Берём «хвост» текста — последние ~280 символов, обрезаем по слову.
function tailPreview(text: string, max = 280): string {
  if (text.length <= max) return text;
  const tail = text.slice(-max);
  const idx = tail.indexOf(" ");
  return "…" + (idx > 0 ? tail.slice(idx) : tail);
}

function ProgressIndicator(props: ProgressIndicatorProps) {
  const activityLabel =
    props.phase === "tool" && props.currentTool
      ? (TOOL_LABEL[props.currentTool] ?? props.currentTool)
      : props.phase === "writing"
        ? "Печатает ответ"
        : ACTIVITY_LABEL[props.activity] ?? (props.thinking ? "Размышляет" : "Запуск…");

  // В фазе writing — показываем хвост content. В фазе tool/thinking — хвост thinking.
  const isShowingContent =
    props.phase === "writing" && props.previewContent.length > 0;
  const previewRaw = isShowingContent
    ? tailPreview(props.previewContent)
    : tailPreview(props.previewThinking);
  const previewLabel = isShowingContent
    ? "Печатает"
    : props.phase === "tool"
      ? "Думает"
      : "Думает";

  return (
    <div style={progressBoxStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={dotStyle} aria-hidden />
        <span style={{ fontWeight: 500, color: "var(--color-foreground)" }}>
          {activityLabel}…
        </span>
        <span style={separatorStyle}>·</span>
        <span title="Время с начала запроса" style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatElapsed(props.elapsedMs)}
        </span>
        {props.outputTokens > 0 ? (
          <>
            <span style={separatorStyle}>·</span>
            <span
              title={`Вход: ${props.inputTokens} (кэш: ${props.cacheReadTokens}), ответ: ${props.outputTokens}`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              ↓ {formatTokens(props.outputTokens)} ток.
            </span>
          </>
        ) : null}
        {props.thinkingMs > 0 ? (
          <>
            <span style={separatorStyle}>·</span>
            <Brain size={11} strokeWidth={1.8} style={{ verticalAlign: "-1px" }} />
            <span title="Время на размышления" style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.round(props.thinkingMs / 1000)}с
            </span>
          </>
        ) : null}
        {props.toolCount > 0 ? (
          <>
            <span style={separatorStyle}>·</span>
            <Wrench size={11} strokeWidth={1.8} style={{ verticalAlign: "-1px" }} />
            <span>{props.toolCount}</span>
          </>
        ) : null}
      </div>
      {previewRaw.trim() ? (
        <div
          style={{
            marginTop: "0.5rem",
            paddingTop: "0.5rem",
            borderTop: "1px dashed var(--color-border)",
            fontSize: "0.78rem",
            color: isShowingContent ? "var(--color-foreground)" : "var(--color-muted-foreground)",
            lineHeight: 1.55,
            fontStyle: isShowingContent ? "normal" : "italic",
            whiteSpace: "pre-wrap",
            maxHeight: "8.5rem",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-accent)",
              marginRight: "0.4rem",
            }}
          >
            {previewLabel} →
          </span>
          {previewRaw}
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "0.5em",
              height: "0.95em",
              marginLeft: "1px",
              verticalAlign: "-2px",
              background: "var(--color-accent)",
              animation: "claude-pulse 0.9s ease-in-out infinite",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

const progressBoxStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "0.55rem 0.875rem",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  fontSize: "0.825rem",
  color: "var(--color-muted-foreground)",
  fontVariantNumeric: "tabular-nums",
  maxWidth: "100%",
};

const dotStyle: React.CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "var(--color-accent)",
  animation: "claude-pulse 1.2s ease-in-out infinite",
  flexShrink: 0,
};

const separatorStyle: React.CSSProperties = {
  color: "var(--color-border-strong)",
  opacity: 0.7,
};

function ToolbarBtn(props: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      style={{
        padding: "0.35rem 0.625rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        background: "var(--color-background)",
        color: "var(--color-foreground)",
        fontSize: "0.75rem",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-muted)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-background)")}
    >
      {props.children}
    </button>
  );
}

const msgActionBtn: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--color-muted-foreground)",
  textDecoration: "none",
  padding: "0.25rem 0.5rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
};

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant";
  const showActions = isAssistant && !message.pending && !message.id.startsWith("local-");

  // Извлекаем thinking из toolCalls если он сохранён в БД с name="_thinking".
  const thinkingFromDb = message.toolCalls?.find((t) => t.name === "_thinking")?.input;
  const thinkingText =
    message.thinking ??
    (thinkingFromDb && typeof (thinkingFromDb as { content?: string }).content === "string"
      ? ((thinkingFromDb as { content: string }).content)
      : undefined);
  const visibleToolCalls = message.toolCalls?.filter((t) => t.name !== "_thinking") ?? [];

  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: isUser ? "85%" : "92%",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
      }}
    >
      {thinkingText ? (
        <details
          style={{
            fontSize: "0.78rem",
            color: "var(--color-muted-foreground)",
            background: "var(--color-accent-soft)",
            border: "1px solid color-mix(in oklch, var(--color-accent) 18%, var(--color-border))",
            borderRadius: "var(--radius-md)",
            padding: "0.5rem 0.75rem",
          }}
          open={message.pending}
        >
          <summary
            style={{
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 500,
              color: "var(--color-foreground)",
              opacity: 0.85,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Brain size={13} strokeWidth={1.7} />
            <span>
              {message.pending ? "Размышления (думает…)" : "Размышления"} ·{" "}
              {thinkingText.length} симв.
            </span>
          </summary>
          <div
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 0",
              borderTop: "1px dashed var(--color-border)",
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: "0.72rem",
              lineHeight: 1.6,
              color: "var(--color-muted-foreground)",
              maxHeight: "400px",
              overflow: "auto",
            }}
          >
            {thinkingText}
          </div>
        </details>
      ) : null}
      {visibleToolCalls.length > 0 ? (
        <details
          style={{
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
            background: "var(--color-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "0.375rem 0.625rem",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              userSelect: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Wrench size={13} strokeWidth={1.7} />
            <span>
              Инструменты ({visibleToolCalls.length}):{" "}
              {visibleToolCalls.map((t) => t.name).join(", ")}
            </span>
          </summary>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {visibleToolCalls.map((t, i) => (
              <li key={i} style={{ fontFamily: "ui-monospace, monospace" }}>
                <strong>{t.name}</strong>
                {t.input && Object.keys(t.input).length > 0 ? (
                  <code
                    style={{
                      display: "block",
                      marginTop: "0.125rem",
                      fontSize: "0.7rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {JSON.stringify(t.input, null, 2).slice(0, 300)}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div
        style={{
          padding: isUser ? "0.7rem 1rem" : "0.875rem 1.125rem",
          borderRadius: "var(--radius-lg)",
          background: isUser
            ? "var(--color-accent)"
            : isSystem
              ? "var(--color-accent-soft)"
              : "var(--color-surface)",
          border: !isUser && !isSystem ? "1px solid var(--color-border)" : "none",
          boxShadow: isUser
            ? "var(--shadow-xs)"
            : isSystem
              ? "none"
              : "var(--shadow-xs)",
          color: isUser ? "var(--color-accent-foreground)" : "var(--color-foreground)",
          fontSize: "0.9375rem",
          lineHeight: 1.65,
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
        ) : message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p style={{ margin: "0.5rem 0", lineHeight: 1.6 }}>{children}</p>
              ),
              h1: ({ children }) => (
                <h2 style={{ fontSize: "1.15rem", marginTop: "1rem", marginBottom: "0.5rem" }}>
                  {children}
                </h2>
              ),
              h2: ({ children }) => (
                <h3 style={{ fontSize: "1.05rem", marginTop: "0.875rem", marginBottom: "0.5rem" }}>
                  {children}
                </h3>
              ),
              h3: ({ children }) => (
                <h4 style={{ fontSize: "0.95rem", marginTop: "0.75rem", marginBottom: "0.4rem" }}>
                  {children}
                </h4>
              ),
              ul: ({ children }) => (
                <ul style={{ paddingLeft: "1.5rem", margin: "0.5rem 0" }}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol style={{ paddingLeft: "1.5rem", margin: "0.5rem 0" }}>{children}</ol>
              ),
              li: ({ children }) => <li style={{ margin: "0.25rem 0" }}>{children}</li>,
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--color-accent)", textDecoration: "underline" }}
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code
                  style={{
                    background: "var(--color-background)",
                    padding: "0.1rem 0.3rem",
                    borderRadius: "3px",
                    fontSize: "0.85em",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre
                  style={{
                    background: "var(--color-background)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    overflow: "auto",
                    fontSize: "0.825rem",
                  }}
                >
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  style={{
                    borderLeft: "3px solid var(--color-border)",
                    paddingLeft: "0.75rem",
                    margin: "0.5rem 0",
                    color: "var(--color-muted-foreground)",
                    fontStyle: "italic",
                  }}
                >
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <table
                  style={{
                    borderCollapse: "collapse",
                    margin: "0.75rem 0",
                    fontSize: "0.85rem",
                  }}
                >
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th
                  style={{
                    border: "1px solid var(--color-border)",
                    padding: "0.375rem 0.625rem",
                    background: "var(--color-background)",
                    textAlign: "left",
                  }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td
                  style={{
                    border: "1px solid var(--color-border)",
                    padding: "0.375rem 0.625rem",
                  }}
                >
                  {children}
                </td>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : message.pending ? (
          <span style={{ opacity: 0.6 }}>…</span>
        ) : null}
      </div>

      {showActions ? (
        <div style={{ display: "flex", gap: "0.375rem", marginLeft: "0.25rem" }}>
          <a
            href={`/api/export/docx?messageId=${message.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Скачать ответ как .docx"
            style={msgActionBtn}
          >
            <FileText size={12} strokeWidth={1.8} />
            <span>.docx</span>
          </a>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(message.content)}
            title="Скопировать в буфер обмена"
            style={msgActionBtn}
          >
            <Copy size={12} strokeWidth={1.8} />
            <span>Копировать</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
