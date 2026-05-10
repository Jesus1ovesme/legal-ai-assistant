import { z } from "zod";
import { ULID_REGEX, type ULID } from "./ulid";

/** Роль сообщения в диалоге. `tool` — служебные tool_result blocks. */
export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
  TOOL = "tool",
}

export const MessageRoleSchema = z.nativeEnum(MessageRole);

/**
 * Цитата на источник (НПА, судпрактика, веб). Строится по результату tool_call.
 * В тексте сообщения отображается как `[N]`, в правой панели — кликабельный список.
 */
export interface Citation {
  /** Порядковый номер в этом ответе. */
  index: number;
  url: string;
  title: string;
  /** Выдержка / релевантный фрагмент. */
  excerpt?: string;
  /** Дата публикации/редакции, если применимо (для НПА — критично). */
  date?: string;
  /** Имя tool, через который получен источник. */
  source_tool: string;
}

export const CitationSchema = z.object({
  index: z.number().int().positive(),
  url: z.string().url(),
  title: z.string(),
  excerpt: z.string().optional(),
  date: z.string().optional(),
  source_tool: z.string(),
});

/**
 * Запись о вызове инструмента (хранится в `messages.tool_calls` JSONB).
 * Полный input/output также дублируется в отдельную таблицу `tool_call_log` с обрезкой.
 */
export interface ToolCall {
  /** Anthropic-генерируемый ID tool_use block. */
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  /** Output handler'а. Для больших результатов — урезается с `truncated: true`. */
  output?: unknown;
  truncated?: boolean;
  latencyMs?: number;
  error?: string;
}

export const ToolCallSchema = z.object({
  toolUseId: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
  output: z.unknown().optional(),
  truncated: z.boolean().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

/**
 * Сообщение в чате папки.
 * - `archived=true` — скрыто из активного диалога (поставлено через 🧹 Clear).
 * - `turn_id` — UUID, объединяющий все messages одного user→assistant обмена
 *   (включая tool-loop: assistant tool_use, tool result, assistant text...).
 */
export interface Message {
  id: ULID;
  folderId: ULID;
  /** UUID — все messages одного оборота tool-loop'а имеют одинаковый turnId. */
  turnId: string;
  role: MessageRole;
  /** Markdown. Для tool — JSON-строка результата. */
  content: string;
  /** Для assistant — список tool_calls этого хода. */
  toolCalls: ReadonlyArray<ToolCall> | null;
  /** Цитаты, извлечённые из tool результатов и встроенные в ответ через `[N]`. */
  citations: ReadonlyArray<Citation> | null;
  tokensIn: number | null;
  tokensOut: number | null;
  archived: boolean;
  createdAt: Date;
}

export const MessageSchema = z.object({
  id: z.string().regex(ULID_REGEX),
  folderId: z.string().regex(ULID_REGEX),
  turnId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).nullable(),
  citations: z.array(CitationSchema).nullable(),
  tokensIn: z.number().int().nonnegative().nullable(),
  tokensOut: z.number().int().nonnegative().nullable(),
  archived: z.boolean(),
  createdAt: z.date(),
});

/** Облегчённое сообщение для отправки в Anthropic SDK (после построения context). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
