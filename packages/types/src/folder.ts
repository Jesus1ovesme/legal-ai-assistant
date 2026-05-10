import { z } from "zod";
import { CaseType, CaseTypeSchema } from "./case-type";
import { Effort, EffortSchema } from "./chat";
import { ULID_REGEX, type ULID } from "./ulid";

/**
 * Папка дела. В UI и domain-модели ОДНОВРЕМЕННО является:
 *   - контейнером файлов (внутри `<UPLOADS>/<folderId>/<sha256>.<ext>`),
 *   - чат-сессией (1:1 — одна папка = один чат).
 *
 * При создании выбирается {@link CaseType}, из YAML копируется system_prompt в
 * текущее значение, чтобы редактирование YAML позже не меняло поведение существующих папок.
 */
export interface Folder {
  id: ULID;
  userId: ULID;
  /** Человекочитаемое имя, например «ОСАГО претензия Иванов». */
  name: string;
  caseType: CaseType;
  /** System prompt, скопированный из YAML на момент создания (+ optional override юриста). */
  systemPrompt: string;
  /** Уровень "усилия" по умолчанию для этой папки (см. {@link Effort}). */
  effort: Effort;
  /** Скрытые папки. /clear не помечает папку, только messages.archived. */
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const FolderSchema = z.object({
  id: z.string().regex(ULID_REGEX),
  userId: z.string().regex(ULID_REGEX),
  name: z.string().min(1).max(200),
  caseType: CaseTypeSchema,
  systemPrompt: z.string(),
  effort: EffortSchema,
  archived: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Вход для создания новой папки (через UI или server action). */
export interface NewFolderInput {
  name: string;
  caseType: CaseType;
  /** Optional override для system prompt (если юрист хочет кастомизировать). */
  systemPromptOverride?: string;
  effort?: Effort;
}

export const NewFolderInputSchema = z.object({
  name: z.string().min(1).max(200),
  caseType: CaseTypeSchema,
  systemPromptOverride: z.string().optional(),
  effort: EffortSchema.optional(),
});

/** Вход для PATCH (rename, change type, archive). Все поля опциональные. */
export interface UpdateFolderInput {
  name?: string;
  caseType?: CaseType;
  systemPrompt?: string;
  effort?: Effort;
  archived?: boolean;
}

export const UpdateFolderInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  caseType: CaseTypeSchema.optional(),
  systemPrompt: z.string().optional(),
  effort: EffortSchema.optional(),
  archived: z.boolean().optional(),
});
