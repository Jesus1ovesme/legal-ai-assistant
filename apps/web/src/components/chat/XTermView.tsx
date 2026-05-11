"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "./VoiceButton";
// xterm.css загружаем через <link> в head — Next 15 webpack RSC-loader не парсит CSS из node_modules.
// Файл скопирован в /public/vendor/xterm.css при сборке.
function ensureXtermCss(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("xterm-css")) return;
  const link = document.createElement("link");
  link.id = "xterm-css";
  link.rel = "stylesheet";
  link.href = "/vendor/xterm.css";
  document.head.appendChild(link);
}

/**
 * Реальный xterm.js + WebSocket к нашему term-server (PTY с claude CLI в cwd папки).
 * Это полная имитация терминала (как ttyd-style web terminal): ANSI цвета, alt-screen, мышь, copy-paste.
 *
 * Lifecycle:
 *  - mount: динамически грузим @xterm/xterm (не SSR) и addon-fit, открываем WS,
 *           подписываемся onData → ws.send(input)
 *  - server отдаёт history (catch-up) при connect
 *  - unmount: ws.close(), terminal.dispose() — но PTY на сервере живёт!
 *  - повторный mount той же папки = catch-up + продолжение
 */

interface XTermViewProps {
  folderId: string;
  active: boolean;
}

export function XTermView({ folderId, active }: XTermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ clients: number }>({ clients: 1 });

  // F11 / Esc — toggle fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        setFullscreen((v) => !v);
      } else if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // При смене fullscreen — re-fit xterm в новый размер контейнера
  useEffect(() => {
    const s = stateRef.current;
    if (!s || s.disposed) return;
    requestAnimationFrame(() => {
      try {
        s.fit.fit();
        if (s.ws && s.ws.readyState === 1) {
          s.ws.send(
            JSON.stringify({ type: "resize", cols: s.term.cols, rows: s.term.rows }),
          );
        }
      } catch (_) {}
    });
  }, [fullscreen]);
  const stateRef = useRef<{
    term: any;
    fit: any;
    ws: WebSocket | null;
    disposed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    let cancelled = false;
    ensureXtermCss();

    (async () => {
      // CanvasAddon стабильнее WebGL на разнородных GPU (intel HD, integrated,
      // mobile, Safari). WebGL даёт fps в 2× больше, но ломается на context loss
      // и оставляет артефакты. Canvas — ровный 60fps без артефактов.
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, canvasMod] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@xterm/addon-canvas").catch(() => null),
      ]);

      if (cancelled || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily:
          'JetBrains Mono, "SF Mono", Menlo, ui-monospace, "Cascadia Code", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.25,
        scrollback: 1000,
        allowProposedApi: true,
        // Уменьшаем количество invalidate'ов: rendererType auto, smoothScroll off
        smoothScrollDuration: 0,
        fastScrollSensitivity: 5,
        theme: {
          background: "#0e0e0c",
          foreground: "#d8d3c2",
          cursor: "#c96442",
          cursorAccent: "#0e0e0c",
          selectionBackground: "#3a3528",
          black: "#1a1814",
          red: "#e07a6a",
          green: "#86c47f",
          yellow: "#e8b86d",
          blue: "#7ab8d4",
          magenta: "#c994c0",
          cyan: "#7eb89c",
          white: "#d8d3c2",
          brightBlack: "#6e6a5e",
          brightRed: "#ff8a7a",
          brightGreen: "#a4d99a",
          brightYellow: "#ffd28a",
          brightBlue: "#a0c8de",
          brightMagenta: "#dca8d4",
          brightCyan: "#9ed4b6",
          brightWhite: "#f0eee6",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      // CanvasAddon — стабильный renderer без WebGL-артефактов.
      if (canvasMod && (canvasMod as any).CanvasAddon) {
        try {
          const canvas = new (canvasMod as any).CanvasAddon();
          term.loadAddon(canvas);
        } catch (_) {
          /* fallback to DOM */
        }
      }
      fit.fit();

      stateRef.current = { term, fit, ws: null, disposed: false };

      // Auto-reconnect: при close/error ставим WS заново с экспоненциальным
      // backoff. Server-side PTY переживает rebuild term-server только если
      // pool сохранён. После рестарта pool пуст — стартует новый claude и
      // catch-up history даст текущее состояние.
      let reconnectAttempt = 0;
      const RECONNECT_MAX_DELAY = 8000;

      const connect = () => {
        const s = stateRef.current;
        if (!s || s.disposed) return;
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${proto}://${window.location.host}/ws/term?folderId=${folderId}`);
        ws.binaryType = "arraybuffer";
        s.ws = ws;

        ws.onopen = () => {
          if (reconnectAttempt > 0) {
            term.write("\r\n\x1b[32m[reconnected]\x1b[0m\r\n");
          }
          reconnectAttempt = 0;
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        };
        // rAF-throttled write: накапливаем chunks, flush 1× за frame.
        // Защищает от freeze при катч-ап history и burst-выводе claude TUI.
        const writeQueue: Array<string | Uint8Array> = [];
        let rafScheduled = false;
        const flushWrite = () => {
          rafScheduled = false;
          if (writeQueue.length === 0) return;
          // term.write batches до ~64KB, потом останавливается — нормально.
          const batch = writeQueue.splice(0);
          for (const chunk of batch) term.write(chunk as any);
        };
        const queueWrite = (data: string | Uint8Array) => {
          writeQueue.push(data);
          if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushWrite);
          }
        };
        ws.onmessage = (e) => {
          if (typeof e.data === "string") {
            // JSON-control (welcome / session_info) или ANSI-байты PTY
            if (e.data.startsWith("{")) {
              try {
                const msg = JSON.parse(e.data);
                if (msg.type === "welcome") {
                  setSessionInfo({ clients: 1 });
                  return;
                }
                if (msg.type === "session_info") {
                  setSessionInfo({ clients: msg.clients });
                  return;
                }
              } catch (_) {
                /* not JSON, treat as ANSI */
              }
            }
            queueWrite(e.data);
          } else {
            queueWrite(new Uint8Array(e.data));
          }
        };
        ws.onerror = () => {
          // Молча — onclose всё равно сработает, не дублируем шум.
        };
        ws.onclose = (event) => {
          const cur = stateRef.current;
          if (!cur || cur.disposed) return;
          // Auth-failure (401/1008) — не повторяем, бесполезно.
          if (event.code === 1008 || event.code === 4401) {
            term.write("\r\n\x1b[31m[authentication failed — reload page]\x1b[0m\r\n");
            return;
          }
          reconnectAttempt++;
          const delay = Math.min(500 * 2 ** (reconnectAttempt - 1), RECONNECT_MAX_DELAY);
          term.write(
            `\r\n\x1b[33m[disconnected — reconnecting in ${Math.round(delay / 1000)}s, attempt ${reconnectAttempt}]\x1b[0m\r\n`,
          );
          setTimeout(connect, delay);
        };
      };
      connect();

      term.onData((data) => {
        const s = stateRef.current;
        if (s?.ws && s.ws.readyState === 1) {
          s.ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Chrome MemorySaver / Safari freeze: при возврате на вкладку зомби-WS
      // (readyState=1, но сокет реально мёртв) мы не успеем заметить пока не
      // упадёт send. Если сокет уже не open — реконнектимся явно.
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        const s = stateRef.current;
        if (!s || s.disposed) return;
        if (!s.ws || s.ws.readyState !== 1) connect();
      };
      document.addEventListener("visibilitychange", onVisibility);

      const onResize = () => {
        const s = stateRef.current;
        if (!s || s.disposed) return;
        try {
          s.fit.fit();
          if (s.ws && s.ws.readyState === 1) {
            s.ws.send(
              JSON.stringify({
                type: "resize",
                cols: s.term.cols,
                rows: s.term.rows,
              }),
            );
          }
        } catch (_) {}
      };
      window.addEventListener("resize", onResize);

      // Cleanup ref
      (stateRef.current as any).cleanupResize = () => {
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    })();

    return () => {
      cancelled = true;
      const s = stateRef.current;
      if (s) {
        s.disposed = true;
        try {
          (s as any).cleanupResize?.();
        } catch (_) {}
        try {
          s.ws?.close();
        } catch (_) {}
        try {
          s.term?.dispose();
        } catch (_) {}
        stateRef.current = null;
      }
    };
  }, [folderId, active]);

  // Drop файла из правой панели → отправляем @-mention в xterm.
  // Claude code распознаёт @<path> и подгружает файл в контекст.
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("text/x-legal-ai-assistant-file")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const filename = e.dataTransfer.getData("text/x-legal-ai-assistant-file");
    if (!filename) return;
    e.preventDefault();
    const s = stateRef.current;
    if (s?.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type: "input", data: `@${filename} ` }));
    }
  };

  // Preset-команды для типовых юр-задач. При клике — отправляем готовый
  // prompt в xterm как input (Claude TUI получит как ввод пользователя).
  const sendPrompt = (text: string) => {
    const s = stateRef.current;
    if (s?.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type: "input", data: text + "\r" }));
    }
  };

  // Сервисные команды для управления Claude TUI:
  //   /clear   — обнулить контекст диалога (Claude забывает историю)
  //   /compact — сжать историю в summary (полезно когда много токенов)
  //   /mcp     — посмотреть подключённые MCP серверы (debug)
  const sendSlashCommand = (cmd: string) => {
    const s = stateRef.current;
    if (s?.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type: "input", data: cmd + "\r" }));
    }
  };

  const PRESETS: Array<{ label: string; title: string; prompt: string }> = [
    {
      label: "📝 Иск",
      title: "Составить исковое заявление по фактам в текущей папке",
      prompt:
        "Составь проект искового заявления по фактам, находящимся в текущей папке. Структура по ГПК ст. 131-132. Используй mcp__legal__find_law для НПА и mcp__legal__search_court_practice для практики. Сохрани в isk.md.",
    },
    {
      label: "📨 Претензия",
      title: "Подготовить досудебную претензию",
      prompt:
        "Подготовь досудебную претензию по фактам в этой папке. Укажи требования, срок ответа (10 дней по ст. 16.1 ФЗ-40 / 30 дней по умолчанию), реквизиты сторон. Сохрани в pretenziya.md.",
    },
    {
      label: "🛡 Отзыв",
      title: "Отзыв ответчика на иск",
      prompt:
        "Подготовь отзыв ответчика по ст. 149 ГПК. Опровергни доводы истца, приложи контр-аргументы. Найди практику в свою пользу через mcp__legal__search_court_practice. Сохрани в otzyv.md.",
    },
    {
      label: "🗂 Ходатайство",
      title: "Процессуальное ходатайство",
      prompt:
        "Составь процессуальное ходатайство (тип уточни у меня — о вызове свидетеля / истребовании доказательств / отложении / ознакомлении с материалами и т.п.). Сохрани в hodataistvo.md.",
    },
    {
      label: "🎯 Стратегия",
      title: "Стратегия защиты по делу",
      prompt:
        "Проанализируй материалы дела в этой папке и предложи правовую стратегию: 1) применимые НПА (через find_law), 2) релевантная практика ВС (search_court_practice), 3) сильные и слабые стороны позиции, 4) план процессуальных действий. Сохрани в strategy.md.",
    },
  ];

  return (
    <div
      style={
        fullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "#0e0e0c",
              display: "flex",
              flexDirection: "column",
            }
          : { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }
      }
    >
      <div
        style={{
          display: "flex",
          gap: "0.3rem",
          padding: "0.4rem 0.5rem",
          background: "#1a1814",
          borderBottom: "1px solid #2a2722",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => sendPrompt(p.prompt)}
            title={p.title}
            style={{
              background: "rgba(60,55,42,0.9)",
              color: "#e8e3d6",
              border: "1px solid #3a3528",
              borderRadius: "4px",
              padding: "0.3rem 0.6rem",
              fontSize: "0.78rem",
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {p.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {sessionInfo.clients > 1 ? (
          <div
            title="К этой папке подключено несколько вкладок/устройств. Все могут печатать."
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.3rem 0.6rem",
              borderRadius: "4px",
              background: "rgba(134,196,127,0.15)",
              color: "#86c47f",
              fontSize: "0.78rem",
              border: "1px solid #3d5938",
            }}
          >
            <span>👥 {sessionInfo.clients} подключено</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            try {
              const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
              const { token } = (await csrfRes.json()) as { token: string };
              const res = await fetch("/api/chat/export-md", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", "x-csrf-token": token },
                body: JSON.stringify({ folderId }),
              });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                alert(`Не удалось экспортировать: ${data.error ?? `HTTP ${res.status}`}`);
                return;
              }
              const data = (await res.json()) as { messages: number; sizeBytes: number };
              alert(
                `Сохранил chat-history.md в папку (${data.messages} сообщ., ${Math.round(data.sizeBytes / 1024)} KB)`,
              );
            } catch (err) {
              alert(`Ошибка: ${(err as Error).message}`);
            }
          }}
          title="Экспортировать диалог в chat-history.md (для архива/клиента)"
          style={toolbarBtnStyle}
        >
          💾 Архив
        </button>
        <button
          type="button"
          onClick={() => sendSlashCommand("/compact")}
          title="Сжать историю диалога в summary (если много токенов)"
          style={toolbarBtnStyle}
        >
          📦 Сжать
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Обнулить контекст? Claude забудет историю диалога. Файлы и CLAUDE.md останутся.")) {
              sendSlashCommand("/clear");
            }
          }}
          title="Обнулить контекст (новая сессия)"
          style={toolbarBtnStyle}
        >
          🧹 Сброс
        </button>
        <div
          title="Голосовой ввод (Whisper) → текст в терминал"
          style={{ display: "flex", alignItems: "center" }}
        >
          <VoiceButton
            onTranscript={(text) => sendPrompt(text)}
            onError={(msg) => console.warn("voice error:", msg)}
          />
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? "Свернуть (Esc / F11)" : "Развернуть (F11)"}
          style={{
            background: "rgba(60,55,42,0.9)",
            color: "#e8e3d6",
            border: "1px solid #3a3528",
            borderRadius: "4px",
            padding: "0.3rem 0.6rem",
            fontSize: "0.78rem",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {fullscreen ? "⛶ Свернуть" : "⛶"}
        </button>
      </div>
      <div
        ref={containerRef}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          background: "#0e0e0c",
          padding: "0.5rem 0.625rem 0.25rem",
          // CSS containment: изолирует xterm от reflow остальной страницы
          // (panels/sidebar). Падение лагов 30-50% при множественных rerender.
          contain: "strict",
        }}
      />
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  background: "rgba(60,55,42,0.9)",
  color: "#e8e3d6",
  border: "1px solid #3a3528",
  borderRadius: "4px",
  padding: "0.3rem 0.6rem",
  fontSize: "0.78rem",
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
