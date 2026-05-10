/**
 * @danilurist/claude-client — адаптер к Claude (api | api+proxy | relay).
 *
 * **Реализация Phase 2** (см. ROADMAP.md). На текущей фазе — только тип-стабы и
 * маппинг effort→model, чтобы можно было typecheck'ить зависимый код.
 *
 * Финальный API (см. план):
 *   - createClaudeClient(opts): ClaudeClient
 *   - client.streamMessage(opts): AsyncIterable<StreamChunk>
 *   - effort: low/medium/high/max → model + thinking budget
 *   - retry exp-backoff, circuit breaker, prompt caching
 */
import { Effort, type ClaudeModelId } from "@danilurist/types";

/** Маппинг effort → выбранная модель. */
export const EFFORT_TO_MODEL: Record<Effort, ClaudeModelId> = {
  [Effort.LOW]: "claude-haiku-4-5-20251001",
  [Effort.MEDIUM]: "claude-sonnet-4-6",
  [Effort.HIGH]: "claude-sonnet-4-6",
  [Effort.MAX]: "claude-opus-4-7",
};

/** Маппинг effort → бюджет thinking-токенов (0 = thinking off). */
export const EFFORT_TO_THINKING_BUDGET: Record<Effort, number> = {
  [Effort.LOW]: 0,
  [Effort.MEDIUM]: 8_000,
  [Effort.HIGH]: 16_000,
  [Effort.MAX]: 32_000,
};

/** Использует ли effort инструменты (low — нет, чтобы быстрее). */
export const EFFORT_TOOLS_ENABLED: Record<Effort, boolean> = {
  [Effort.LOW]: false,
  [Effort.MEDIUM]: true,
  [Effort.HIGH]: true,
  [Effort.MAX]: true,
};

export type { Effort, ClaudeModelId } from "@danilurist/types";
