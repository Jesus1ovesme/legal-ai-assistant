"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceButtonProps {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
}

export function VoiceButton({ disabled, onTranscript, onError }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start(): Promise<void> {
    if (disabled || busy || recording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.("Браузер не поддерживает запись микрофона");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      onError?.(`Микрофон недоступен: ${(err as Error).message}`);
    }
  }

  async function stop(): Promise<void> {
    const mr = recorderRef.current;
    if (!mr || mr.state === "inactive") return;
    setBusy(true);
    setRecording(false);
    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      mr.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      setBusy(false);
      onError?.("Запись пустая");
      return;
    }
    try {
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { token } = (await csrfRes.json()) as { token: string };
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      const res = await fetch("/api/stt", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": token },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        onError?.(data.message ?? data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.text) onTranscript(data.text);
    } catch (err) {
      onError?.(`Сеть: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggle(): void {
    if (recording) void stop();
    else void start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || busy}
      title={recording ? "Остановить запись" : "Голосовой ввод"}
      style={{
        padding: "0.5rem 0.75rem",
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        background: recording ? "var(--color-destructive)" : "var(--color-background)",
        color: recording ? "var(--color-destructive-foreground)" : "var(--color-foreground)",
        cursor: disabled || busy ? "not-allowed" : "pointer",
        fontSize: "0.875rem",
        opacity: disabled ? 0.5 : 1,
        animation: recording ? "stt-pulse 1.2s ease-in-out infinite" : "none",
      }}
    >
      {busy ? "⏳" : recording ? "⏹ Стоп" : "🎙"}
    </button>
  );
}
