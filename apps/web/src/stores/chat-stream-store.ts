/**
 * Глобальный singleton стримов чата по folderId. Решает 2 проблемы:
 *   1. Переключение папки — стрим живёт здесь, переживает unmount.
 *   2. Прогрессбар «зависает» между серверными progress events — локальный
 *      тикер обновляет elapsedMs/outputTokens каждые 250мс.
 *
 * useSyncExternalStore требует **новой ссылки** на снапшот при каждом
 * изменении. Поэтому каждое обновление = пересоздание объекта снапшота
 * через {...prev, ...patch}.
 */

export interface StreamProgress {
  elapsedMs: number;
  activity: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  thinkingMs: number;
  toolCount: number;
}

export interface StreamToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface StreamSnapshot {
  status: "idle" | "streaming" | "done" | "error";
  startedAt: number;
  userTempId: string;
  userContent: string;
  assistantTempId: string;
  thinkingText: string;
  contentText: string;
  toolCalls: StreamToolCall[];
  progress: StreamProgress | null;
  liveElapsedMs: number;
  liveOutputTokens: number;
  isThinkingPhase: boolean;
  // ms timestamps — для определения «текущей фазы» в UI.
  lastTextAt: number;
  lastToolAt: number;
  lastThinkingAt: number;
  error: string | null;
  version: number;
}

interface SessionRuntime {
  folderId: string;
  controller: AbortController;
  serverElapsedMs: number;
  serverElapsedAt: number;
  serverOutputTokens: number;
}

interface SessionEntry {
  snapshot: StreamSnapshot;
  runtime: SessionRuntime;
}

const sessions = new Map<string, SessionEntry>();
const listeners = new Map<string, Set<() => void>>();

const idleSnapshot: StreamSnapshot = Object.freeze({
  status: "idle",
  startedAt: 0,
  userTempId: "",
  userContent: "",
  assistantTempId: "",
  thinkingText: "",
  contentText: "",
  toolCalls: [],
  progress: null,
  liveElapsedMs: 0,
  liveOutputTokens: 0,
  isThinkingPhase: false,
  lastTextAt: 0,
  lastToolAt: 0,
  lastThinkingAt: 0,
  error: null,
  version: 0,
}) as StreamSnapshot;

function emit(folderId: string): void {
  const set = listeners.get(folderId);
  if (!set) return;
  for (const l of set) l();
}

function patchSession(folderId: string, patch: Partial<StreamSnapshot>): void {
  const cur = sessions.get(folderId);
  if (!cur) return;
  // Создаём новую ссылку — это критично для useSyncExternalStore.
  cur.snapshot = {
    ...cur.snapshot,
    ...patch,
    version: (cur.snapshot.version + 1) | 0,
  };
  emit(folderId);
}

export function getSnapshot(folderId: string): StreamSnapshot {
  return sessions.get(folderId)?.snapshot ?? idleSnapshot;
}

export function subscribe(folderId: string, cb: () => void): () => void {
  let set = listeners.get(folderId);
  if (!set) {
    set = new Set();
    listeners.set(folderId, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

// Глобальный тикер. setInterval живёт пока есть активные сессии.
let tickerHandle: ReturnType<typeof setInterval> | null = null;
function ensureTicker(): void {
  if (tickerHandle !== null || typeof window === "undefined") return;
  tickerHandle = setInterval(() => {
    let activeCount = 0;
    const now = Date.now();
    for (const [folderId, entry] of sessions) {
      if (entry.snapshot.status !== "streaming") continue;
      activeCount++;
      const since = now - entry.runtime.serverElapsedAt;
      const newElapsed = entry.runtime.serverElapsedMs + since;
      const proxyTokens = Math.max(
        entry.runtime.serverOutputTokens,
        Math.floor((entry.snapshot.thinkingText.length + entry.snapshot.contentText.length) / 4),
      );
      if (
        newElapsed !== entry.snapshot.liveElapsedMs ||
        proxyTokens !== entry.snapshot.liveOutputTokens
      ) {
        patchSession(folderId, {
          liveElapsedMs: newElapsed,
          liveOutputTokens: proxyTokens,
        });
      }
    }
    if (activeCount === 0 && tickerHandle !== null) {
      clearInterval(tickerHandle);
      tickerHandle = null;
    }
  }, 250);
}

interface StartArgs {
  folderId: string;
  content: string;
  effort: "low" | "medium" | "high" | "max";
  onAppendUserMessage: (msg: { id: string; content: string; createdAt: string }) => void;
  onFinish: () => void;
}

// === Очередь сообщений ===
// Позволяет печатать новые сообщения пока Claude ещё думает над предыдущим.
// Каждое после завершения текущего автоматически берётся из очереди.
export interface QueuedMessage {
  id: string;
  content: string;
  effort: "low" | "medium" | "high" | "max";
  enqueuedAt: number;
}
const queues = new Map<string, QueuedMessage[]>();
// Колбэки для onAppend/onFinish — храним вместе с очередью, чтобы запустить
// следующий элемент с теми же параметрами.
type QueueCallbacks = {
  onAppendUserMessage: StartArgs["onAppendUserMessage"];
  onFinish: StartArgs["onFinish"];
};
const queueCallbacks = new Map<string, QueueCallbacks>();

export function getQueue(folderId: string): QueuedMessage[] {
  return queues.get(folderId) ?? [];
}

export function removeFromQueue(folderId: string, id: string): void {
  const q = queues.get(folderId);
  if (!q) return;
  const next = q.filter((m) => m.id !== id);
  if (next.length === 0) queues.delete(folderId);
  else queues.set(folderId, next);
  emit(folderId);
}

export function clearQueue(folderId: string): void {
  if (queues.delete(folderId)) emit(folderId);
}

/**
 * Поставить сообщение в очередь. Если стрим не активен — сразу запустить.
 * Возвращает id очередной записи (для отмены через removeFromQueue).
 */
export function enqueueMessage(args: StartArgs): string {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: QueuedMessage = {
    id,
    content: args.content,
    effort: args.effort,
    enqueuedAt: Date.now(),
  };
  const cur = queues.get(args.folderId) ?? [];
  queues.set(args.folderId, [...cur, item]);
  queueCallbacks.set(args.folderId, {
    onAppendUserMessage: args.onAppendUserMessage,
    onFinish: args.onFinish,
  });
  emit(args.folderId);
  // Если стрим неактивен — сразу запустим первый элемент.
  const session = sessions.get(args.folderId);
  if (!session || session.snapshot.status !== "streaming") {
    void runNextFromQueue(args.folderId);
  }
  return id;
}

async function runNextFromQueue(folderId: string): Promise<void> {
  const q = queues.get(folderId);
  if (!q || q.length === 0) return;
  const cb = queueCallbacks.get(folderId);
  if (!cb) return;
  const [next, ...rest] = q;
  if (rest.length === 0) queues.delete(folderId);
  else queues.set(folderId, rest);
  emit(folderId);
  await startStream({
    folderId,
    content: next!.content,
    effort: next!.effort,
    onAppendUserMessage: cb.onAppendUserMessage,
    onFinish: cb.onFinish,
  });
}

export async function startStream(args: StartArgs): Promise<void> {
  const { folderId, content, effort, onAppendUserMessage, onFinish } = args;

  const existing = sessions.get(folderId);
  if (existing && existing.snapshot.status === "streaming") return;

  const userTempId = `local-user-${Date.now()}`;
  const assistantTempId = `local-asst-${Date.now()}`;
  const startedAt = Date.now();
  const controller = new AbortController();

  const initialSnapshot: StreamSnapshot = {
    status: "streaming",
    startedAt,
    userTempId,
    userContent: content,
    assistantTempId,
    thinkingText: "",
    contentText: "",
    toolCalls: [],
    progress: null,
    liveElapsedMs: 0,
    liveOutputTokens: 0,
    isThinkingPhase: true,
    lastTextAt: 0,
    lastToolAt: 0,
    lastThinkingAt: startedAt,
    error: null,
    version: 1,
  };
  sessions.set(folderId, {
    snapshot: initialSnapshot,
    runtime: {
      folderId,
      controller,
      serverElapsedMs: 0,
      serverElapsedAt: startedAt,
      serverOutputTokens: 0,
    },
  });
  emit(folderId);
  ensureTicker();

  onAppendUserMessage({
    id: userTempId,
    content,
    createdAt: new Date(startedAt).toISOString(),
  });

  try {
    const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    const { token } = (await csrfRes.json()) as { token: string };

    const res = await fetch("/api/chat/stream", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "x-csrf-token": token },
      body: JSON.stringify({ folderId, content, effort }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      patchSession(folderId, {
        status: "error",
        error: `Ошибка: ${data.error ?? `HTTP ${res.status}`}`,
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        if (!evt.trim()) continue;
        let eventName = "message";
        let dataStr = "";
        for (const line of evt.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6);
        }
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>;
          handleStreamEvent(folderId, eventName, data);
        } catch {
          // ignore parse errors
        }
      }
    }
    patchSession(folderId, { status: "done" });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      patchSession(folderId, { status: "done", error: "Запрос прерван" });
    } else {
      patchSession(folderId, { status: "error", error: `Сеть: ${(err as Error).message}` });
    }
  } finally {
    onFinish();
    setTimeout(() => {
      const cur = sessions.get(folderId);
      if (cur && cur.snapshot.status !== "streaming") {
        sessions.delete(folderId);
        emit(folderId);
      }
      // Auto-run next из очереди если есть.
      const q = queues.get(folderId);
      if (q && q.length > 0) {
        void runNextFromQueue(folderId);
      }
    }, 1500);
  }
}

function handleStreamEvent(
  folderId: string,
  eventName: string,
  data: Record<string, unknown>,
): void {
  const entry = sessions.get(folderId);
  if (!entry) return;
  const snap = entry.snapshot;
  const rt = entry.runtime;

  if (eventName === "progress") {
    const progress: StreamProgress = {
      elapsedMs: typeof data.elapsedMs === "number" ? data.elapsedMs : 0,
      activity: typeof data.activity === "string" ? data.activity : "",
      inputTokens: typeof data.inputTokens === "number" ? data.inputTokens : 0,
      outputTokens: typeof data.outputTokens === "number" ? data.outputTokens : 0,
      cacheReadTokens: typeof data.cacheReadTokens === "number" ? data.cacheReadTokens : 0,
      thinkingMs: typeof data.thinkingMs === "number" ? data.thinkingMs : 0,
      toolCount: typeof data.toolCount === "number" ? data.toolCount : 0,
    };
    rt.serverElapsedMs = progress.elapsedMs;
    rt.serverElapsedAt = Date.now();
    rt.serverOutputTokens = progress.outputTokens;
    patchSession(folderId, {
      progress,
      liveElapsedMs: Math.max(snap.liveElapsedMs, progress.elapsedMs),
      liveOutputTokens: Math.max(snap.liveOutputTokens, progress.outputTokens),
    });
  } else if (eventName === "thinking") {
    const delta = typeof data.delta === "string" ? data.delta : "";
    if (delta) {
      patchSession(folderId, {
        thinkingText: snap.thinkingText + delta,
        isThinkingPhase: true,
        lastThinkingAt: Date.now(),
      });
    }
  } else if (eventName === "text") {
    const delta = typeof data.delta === "string" ? data.delta : "";
    if (delta) {
      patchSession(folderId, {
        contentText: snap.contentText + delta,
        isThinkingPhase: false,
        lastTextAt: Date.now(),
      });
    }
  } else if (eventName === "tool_use") {
    const name = typeof data.name === "string" ? data.name : "";
    const input = (data.input ?? {}) as Record<string, unknown>;
    if (name) {
      patchSession(folderId, {
        toolCalls: [...snap.toolCalls, { name, input }],
        isThinkingPhase: true,
        lastToolAt: Date.now(),
      });
    }
  } else if (eventName === "tool_result") {
    patchSession(folderId, { lastToolAt: Date.now() });
  } else if (eventName === "done") {
    patchSession(folderId, { status: "done" });
  } else if (eventName === "error") {
    patchSession(folderId, {
      status: "error",
      error: typeof data.message === "string" ? data.message : "Ошибка стрима",
    });
  }
}

export function abortStream(folderId: string, options?: { keepQueue?: boolean }): void {
  const entry = sessions.get(folderId);
  if (entry && entry.snapshot.status === "streaming") {
    entry.runtime.controller.abort();
  }
  if (!options?.keepQueue) {
    clearQueue(folderId);
  }
}

export function isStreaming(folderId: string): boolean {
  return sessions.get(folderId)?.snapshot.status === "streaming";
}
