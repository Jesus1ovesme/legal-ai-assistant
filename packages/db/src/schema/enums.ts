import { pgEnum } from "drizzle-orm/pg-core";

/** Тип юр. дела. Значения совпадают с {@link import("@legal-ai-assistant/types").CaseType}. */
export const caseTypeEnum = pgEnum("case_type", [
  "OSAGO",
  "DTP",
  "LABOR",
  "FAMILY",
  "INHERITANCE",
  "ADMIN",
  "CRIMINAL",
  "PROCUREMENT",
  "GENERAL",
]);

/** Состояние OCR-pipeline для файла. */
export const ocrStatusEnum = pgEnum("ocr_status", [
  "pending",
  "processing",
  "done",
  "failed",
  "skipped",
]);

/** Роль сообщения в чате. */
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system", "tool"]);

/** Уровень "усилия" — маппится на model + thinking budget на уровне claude-client. */
export const effortEnum = pgEnum("effort", ["low", "medium", "high", "max"]);
