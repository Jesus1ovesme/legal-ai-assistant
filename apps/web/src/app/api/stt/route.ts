import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { createDb, schema } from "@legal-ai-assistant/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function ffmpeg(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("ffmpeg timeout"));
    }, 60_000);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve();
    });
  });
}

async function transcribeOpenAI(wavPath: string, apiKey: string): Promise<string> {
  const wav = readFileSync(wavPath);
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  fd.append("model", "whisper-1");
  fd.append("language", "ru");
  fd.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`whisper api ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const log = logger.child({ requestId, route: "/api/stt" });

  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf_invalid" }, { status: 403 });
  }

  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "stt_not_configured", message: "STT отключён: установи OPENAI_API_KEY в .env." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "no_audio" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "too_large", limit: MAX_AUDIO_BYTES }, { status: 413 });
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "stt-"));
  const inputPath = path.join(tmpDir, "in");
  const wavPath = path.join(tmpDir, "out.wav");
  try {
    const buf = Buffer.from(await audio.arrayBuffer());
    writeFileSync(inputPath, buf);
    await ffmpeg(inputPath, wavPath);
    const start = Date.now();
    const text = await transcribeOpenAI(wavPath, env.OPENAI_API_KEY);
    const durationMs = Date.now() - start;
    log.info({ durationMs, textLength: text.length }, "stt_ok");

    const db = createDb({ connectionString: env.DATABASE_URL });
    await db.insert(schema.auditLog).values({
      action: "STT_TRANSCRIBE",
      userId: auth.userId,
      requestId,
      latencyMs: durationMs,
      payload: { audioBytes: audio.size, textLength: text.length },
      ip: req.headers.get("x-forwarded-for") ?? null,
    });

    return NextResponse.json({ text, durationMs });
  } catch (err) {
    log.error({ err: (err as Error).message }, "stt_failed");
    return NextResponse.json({ error: "stt_failed", message: (err as Error).message }, { status: 500 });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
