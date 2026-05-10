/**
 * @danilurist/stt — голосовой ввод через Whisper.
 *
 * **Реализация Phase 3** (см. ROADMAP.md). MVP-провайдер: **OpenAI Whisper API**
 * (RAM сервера 5.8 GB total / 2.5 GB free — локальный whisper.cpp medium небезопасен).
 * Fallback `whisper-cpp tiny` (75MB) при отсутствии OPENAI_API_KEY.
 *
 * Pipeline: blob webm/opus → ffmpeg → 16kHz mono WAV → провайдер → текст.
 */

export interface SttResult {
  text: string;
  durationMs: number;
  provider: "openai-api" | "whisper-cpp";
}

export const TARGET_SAMPLE_RATE = 16_000;
export const TARGET_CHANNELS = 1;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
