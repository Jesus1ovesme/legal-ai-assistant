import { z } from "zod";

/**
 * Тип юридического дела. Используется как ENUM в БД и ключ YAML-пресета
 * (`apps/web/config/case-types/<key>.yaml`). Каждый тип имеет специфический
 * system prompt + чек-лист документов + применимые НПА.
 */
export enum CaseType {
  /** ОСАГО (страховое возмещение по обязательному автогражданскому страхованию). */
  OSAGO = "OSAGO",
  /** ДТП (общее, кроме ОСАГО — ущерб, моральный вред, упущенная выгода). */
  DTP = "DTP",
  /** Трудовые споры (ТК РФ: восстановление, оплата, дисциплинарка). */
  LABOR = "LABOR",
  /** Семейное право (СК РФ: развод, раздел, алименты, родительские права). */
  FAMILY = "FAMILY",
  /** Наследственные дела (ГК часть III: завещания, нотариат, ЕГРН). */
  INHERITANCE = "INHERITANCE",
  /** Административные правонарушения (КоАП, КАС). */
  ADMIN = "ADMIN",
  /** Уголовные дела (УК, УПК). */
  CRIMINAL = "CRIMINAL",
  /** Госзакупки (ФЗ-44, ФЗ-223, ФАС-практика). */
  PROCUREMENT = "PROCUREMENT",
  /** Универсальный/прочее — без преднаполненного чек-листа. */
  GENERAL = "GENERAL",
}

export const CaseTypeSchema = z.nativeEnum(CaseType);

/** Применимый НПА в составе case-type определения. */
export interface ApplicableNpa {
  /** Идентификатор акта в системе (например, "40-FZ", "431-P", "VSRF-31-2022"). */
  law_id: string;
  /** Полное название акта. */
  title: string;
  /** Ключевые статьи, на которые юрист чаще всего опирается в этом типе дел. */
  key_articles?: ReadonlyArray<number | string>;
}

export const ApplicableNpaSchema = z.object({
  law_id: z.string().min(1),
  title: z.string().min(1),
  key_articles: z.array(z.union([z.number(), z.string()])).optional(),
});

/**
 * Определение типа дела (загружается из YAML-файла в apps/web/config/case-types/).
 * При создании папки `system_prompt` копируется в `folders.system_prompt`,
 * чтобы изменения YAML не ломали историю существующих папок.
 */
export interface CaseTypeDefinition {
  /** Соответствует значению {@link CaseType}. */
  key: CaseType;
  /** Человекочитаемое название (RU). */
  name_ru: string;
  /** Краткое описание для UI (1-2 предложения). */
  description: string;
  /** System prompt для Claude (multi-line, с правилами цитирования и acceptance criteria). */
  system_prompt: string;
  /** Чек-лист документов, которые юристу стоит собрать по этому типу дела. */
  document_checklist: ReadonlyArray<string>;
  /** НПА, на которые AI должен опираться по умолчанию. */
  applicable_npa: ReadonlyArray<ApplicableNpa>;
  /** Список инструментов (имён tool definitions), активных по умолчанию. */
  default_tools: ReadonlyArray<string>;
}

export const CaseTypeDefinitionSchema = z.object({
  key: CaseTypeSchema,
  name_ru: z.string().min(1),
  description: z.string().min(1),
  system_prompt: z.string().min(1),
  document_checklist: z.array(z.string()).default([]),
  applicable_npa: z.array(ApplicableNpaSchema).default([]),
  default_tools: z.array(z.string()).default([]),
});

/** Тип, выведенный из zod-схемы (учитывая `.default([])` — после parse поля гарантированно заполнены). */
export type CaseTypeDefinitionParsed = z.output<typeof CaseTypeDefinitionSchema>;
