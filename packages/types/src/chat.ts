import { z } from "zod";

/**
 * Уровень "усилия" модели. Маппится на model + thinking budget + наличие tools.
 *   low    → claude-haiku-4-5     · thinking off · tools off
 *   medium → claude-sonnet-4-6    · thinking 8k  · tools on
 *   high   → claude-sonnet-4-6    · thinking 16k · tools on
 *   max    → claude-opus-4-7      · thinking 32k · tools on  (default)
 */
export enum Effort {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  MAX = "max",
}

export const EffortSchema = z.nativeEnum(Effort);

/** Идентификаторы поддерживаемых моделей Claude (привязка к версии 4.x). */
export type ClaudeModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export const ClaudeModelIdSchema: z.ZodType<ClaudeModelId> = z.union([
  z.literal("claude-opus-4-7"),
  z.literal("claude-sonnet-4-6"),
  z.literal("claude-haiku-4-5-20251001"),
]);

/** Транспорт для адаптера ClaudeClient. */
export enum ClaudeTransport {
  /** Прямой Anthropic API (default в MVP). */
  API = "api",
  /** Anthropic SDK + outbound HTTPS/SOCKS proxy (для обхода геоблока через Xray). */
  API_PROXY = "api+proxy",
  /** Кастомный OAuth-релей (slot для будущего, в MVP — заглушка throws). */
  RELAY = "relay",
}

export const ClaudeTransportSchema = z.nativeEnum(ClaudeTransport);

/** Анти-галлюцинационный verifier — статус цитаты после post-pass. */
export enum CitationVerificationStatus {
  /** Цитата подтверждена tool_call'ом за этот turn. */
  VERIFIED = "verified",
  /** AI цитировал, но tool_call'а не было — second-pass пометил под сомнение. */
  UNVERIFIED = "unverified",
  /** Tool_call был, но вернул "не найдено" → AI признал это в тексте. */
  ABSENT = "absent",
}

/**
 * Discriminated union для нормализованного потока от ClaudeClient.streamMessage().
 * UI / API-route потребляют именно этот формат (а не сырой Anthropic SSE).
 */
export type StreamChunk =
  | {
      type: "message_start";
      usage: {
        input_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
    }
  | {
      type: "content_block_start";
      index: number;
      block: { type: "text" | "thinking" | "tool_use"; id?: string; name?: string };
    }
  | { type: "text_delta"; index: number; text: string }
  | { type: "thinking_delta"; index: number; text: string }
  | { type: "tool_use_input_json_delta"; index: number; partial_json: string }
  | { type: "content_block_stop"; index: number }
  | {
      type: "message_delta";
      stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | null;
      usage: { output_tokens: number };
    }
  | { type: "error"; error: { type: string; message: string } };
