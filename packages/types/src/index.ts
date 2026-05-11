/**
 * @legal-ai-assistant/types — общие типы и enums всего проекта.
 *
 * Импортируется всеми остальными пакетами (db, sandbox, claude-client, claude-tools,
 * embeddings, ocr, stt, docx-export, ui) и приложением apps/web.
 *
 * Принципы:
 *   - никаких runtime-зависимостей кроме `zod`;
 *   - на каждый interface — соответствующая `zod`-схема для валидации на boundary;
 *   - ULID — branded string, нельзя случайно подсунуть произвольную строку.
 */
export * from "./ulid";
export * from "./case-type";
export * from "./folder";
export * from "./file";
export * from "./message";
export * from "./chat";
export * from "./result";
