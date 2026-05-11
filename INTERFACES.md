# INTERFACES — legal-ai-assistant

> Полный набор TypeScript типов и интерфейсов системы. Source of truth для `packages/types` и для контрактов между модулями.
> Cross-references: [PRD.md](./PRD.md), [DESIGN_DOC.md](./DESIGN_DOC.md), [PBS_ATOMIC.md](./PBS_ATOMIC.md), [ROADMAP.md](./ROADMAP.md).

---

## Оглавление

1. [Core Enums](#1-core-enums)
2. [Core Domain Interfaces](#2-core-domain-interfaces)
3. [ClaudeClient API](#3-claudeclient-api)
4. [Tool input/output schemas (9 tools)](#4-tool-inputoutput-schemas-9-tools)
5. [CaseType YAML schema](#5-casetype-yaml-schema)
6. [API Request/Response (zod)](#6-api-requestresponse-zod)
7. [Frontend Stores](#7-frontend-stores)
8. [SQL DDL](#8-sql-ddl)

---

## 1. Core Enums

```ts
// packages/types/src/case-type.ts

/** 9 типов дел. Соответствует pgEnum case_type в БД и YAML-файлам в apps/web/config/case-types/. */
export enum CaseType {
  /** ОСАГО (страховое возмещение по обязательному страхованию автогражданской ответственности). */
  OSAGO = 'OSAGO',
  /** ДТП (включая взыскание ущерба сверх лимита ОСАГО, регресс, виновность). */
  DTP = 'DTP',
  /** Трудовые споры (увольнение, з/п, дисциплинарка, мобилизация). */
  LABOR = 'LABOR',
  /** Семейное право (развод, алименты, раздел имущества, опека). */
  FAMILY = 'FAMILY',
  /** Наследство (завещание, выморочное, иждивение, восстановление сроков). */
  INHERITANCE = 'INHERITANCE',
  /** Административка (КоАП, обжалование штрафов, лишение прав). */
  ADMIN = 'ADMIN',
  /** Уголовные дела (защита по 51 АПК, обжалование, УДО). */
  CRIMINAL = 'CRIMINAL',
  /** Госзакупки (44-ФЗ, 223-ФЗ, ФАС). */
  PROCUREMENT = 'PROCUREMENT',
  /** Общие гражданские/иные дела без специализации. */
  GENERAL = 'GENERAL',
}
```

```ts
// packages/types/src/file.ts (фрагмент)

/** Состояние OCR-обработки файла. */
export type OcrStatus =
  /** Поставлен в очередь, не начат. */
  | 'pending'
  /** Воркер взял в работу. */
  | 'processing'
  /** Завершён, ocr_text заполнен. */
  | 'done'
  /** Завершился ошибкой, ocr_error заполнен. */
  | 'failed'
  /** Не подлежит OCR (audio/* и т.п.). */
  | 'skipped';
```

```ts
// packages/types/src/message.ts (фрагмент)

/** Роль автора сообщения. */
export type MessageRole =
  /** Сообщение юриста (input). */
  | 'user'
  /** Ответ Claude. */
  | 'assistant'
  /** Системное сообщение (BASE_GUIDELINES, summary после /compact). */
  | 'system'
  /** Промежуточный результат tool-вызова (debug-уровень, в UI обычно скрыт). */
  | 'tool';
```

```ts
// packages/types/src/chat.ts (фрагмент)

/** Уровень усилий Claude при ответе. Маппится на model + thinking + tools в effortToModel(). */
export enum Effort {
  /** Скорость: Haiku 4.5, без thinking, без tools. */
  LOW = 'low',
  /** Стандарт: Sonnet 4.6, thinking 8k, tools on. */
  MEDIUM = 'medium',
  /** Глубоко: Sonnet 4.6, thinking 16k, tools on. */
  HIGH = 'high',
  /** Максимум: Opus 4.7, thinking 32k, tools on. Default. */
  MAX = 'max',
}
```

```ts
// packages/claude-client/src/types.ts (фрагмент)

/** Способ доступа к Anthropic API. */
export enum ClaudeTransport {
  /** Прямой API call (default). */
  API = 'api',
  /** API через Xray socks5 (обход геоблока). */
  API_PROXY = 'api+proxy',
  /** Будущий OAuth-релей (slot, throws в MVP). */
  RELAY = 'relay',
}
```

---

## 2. Core Domain Interfaces

### 2.1. User, Folder, FileEntity, Message, Citation

```ts
// packages/types/src/result.ts

/** Алгебраический результат (либо успех, либо ошибка) — без exceptions. */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** ULID — 26-символьный Crockford32 идентификатор (timestamp-prefixed). */
export type ULID = string;
```

```ts
// packages/types/src/user.ts

/** Пользователь системы. В MVP — один. */
export interface User {
  id: ULID;
  /** Уникальный email, используется при логине. */
  email: string;
  /** bcrypt(12) хэш пароля. */
  passwordHash: string;
  /** Отображаемое имя в UI. */
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

```ts
// packages/types/src/folder.ts

/** Папка дела (= чат-сессия). У каждой — тип, system prompt, файлы, история сообщений. */
export interface Folder {
  id: ULID;
  userId: ULID;
  /** Человеко-читаемое имя, напр. «ОСАГО / Иванов / РСА». */
  name: string;
  caseType: CaseType;
  /** System prompt, скопированный из YAML-пресета на момент создания. Пользователь может править. */
  systemPrompt: string;
  /** Уровень усилий по умолчанию для этой папки. */
  effort: Effort;
  /** True — папка в архиве, скрыта из основного списка, не удалена. */
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

```ts
// packages/types/src/file.ts

/** Файл, загруженный в папку. Хранится в файловой sandbox `<UPLOADS>/<folderId>/<sha256>.<ext>`. */
export interface FileEntity {
  id: ULID;
  folderId: ULID;
  /** Оригинальное имя файла, как загрузил юрист. */
  filename: string;
  /** Абсолютный путь на диске. */
  storagePath: string;
  /** MIME-тип после magic-byte detection (а НЕ из заголовка). */
  mime: string;
  sizeBytes: number;
  /** SHA-256 содержимого (64 hex). UNIQUE(folder_id, sha256). */
  sha256: string;
  ocrStatus: OcrStatus;
  /** Текст после OCR/extract — null если ещё не обработан. */
  ocrText: string | null;
  /** Stack trace ошибки, если ocrStatus='failed'. */
  ocrError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

```ts
// packages/types/src/message.ts

/** Один tool-вызов внутри turn'а. Сериализуется в `messages.tool_calls jsonb` и отдельно в `tool_call_log`. */
export interface ToolCallLog {
  /** Имя инструмента, см. registry в packages/claude-tools. */
  name: string;
  /** Input как Claude его вызвал (после zod validation). */
  input: Record<string, unknown>;
  /** Output handler'а (до truncation, если уместился). */
  output: unknown;
  /** True если output был обрезан до size cap (60 KB обычно). */
  outputTruncated: boolean;
  /** Время выполнения handler'а в миллисекундах. */
  latencyMs: number;
  /** Текст ошибки если handler бросил. */
  error?: string;
}

/** Сообщение в чате. user/assistant/system/tool. */
export interface Message {
  id: ULID;
  folderId: ULID;
  /** UUID v7 — группа взаимосвязанных сообщений в одном tool-loop'е. */
  turnId: string;
  role: MessageRole;
  /** Markdown текст сообщения. */
  content: string;
  /** Список tool-вызовов внутри этого сообщения (для assistant/tool). */
  toolCalls: ToolCallLog[] | null;
  /** Сколько input-токенов потратил Claude на этот turn. */
  tokensIn: number | null;
  /** Сколько output-токенов сгенерировал Claude. */
  tokensOut: number | null;
  /** True после нажатия 🧹 «Очистить чат» — скрыто из истории, не удалено. */
  archived: boolean;
  createdAt: Date;
}
```

```ts
// packages/types/src/chat.ts

/** Цитата НПА в ответе AI: «согласно ст. 12 ФЗ-40 [1]». */
export interface Citation {
  /** Номер цитаты в ответе ([1], [2], ...). */
  index: number;
  /** URL источника (pravo.gov.ru / sudact.ru / иное). */
  url: string;
  /** Заголовок документа, если был получен через fetch_npa_document. */
  title?: string;
  /** True если найден соответствующий tool_call_log запись с пересекающимся URL. */
  verified: boolean;
  /** ID tool_call_log записи, через которую verified. Опционально. */
  toolCallId?: string;
}
```

### 2.2. Embedding

```ts
// packages/types/src/embedding.ts

/** RAG-чанк в pgvector. */
export interface Embedding {
  id: ULID;
  fileId: ULID;
  folderId: ULID;
  /** Порядковый номер чанка в файле, начиная с 0. */
  chunkIndex: number;
  /** Текст чанка (без префикса 'passage:'). */
  content: string;
  /** Числовой вектор 1024-dim (e5-large) или 3072 (openai). */
  embedding: number[];
  /** Метаданные: { page, header_path: ['Глава 1', 'Параграф 2'] }, etc. */
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
```

---

## 3. ClaudeClient API

### 3.1. StreamMessageOpts, StreamChunk

```ts
// packages/claude-client/src/types.ts

/** Один блок системного промпта с возможностью кэширования. */
export interface SystemBlock {
  type: 'text';
  text: string;
  /** Если задан — Anthropic кэширует этот блок (5min TTL). */
  cache_control?: { type: 'ephemeral' };
}

/** Опции одного streamMessage call. */
export interface StreamMessageOpts {
  /** Имя модели Anthropic, напр. 'claude-opus-4-7' */
  model: string;
  /** Массив system-блоков для гранулярного caching. */
  system: SystemBlock[];
  /** История + новое user-сообщение. */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
  }>;
  /** Доступные tools (зависит от effort и caseType). */
  tools?: ToolDef[];
  /** Эффорт — определяет thinking budget и model. */
  effort?: Effort;
  /** Soft-limit на output tokens (по умолчанию из env). */
  maxTokens?: number;
  /** AbortSignal для отмены запроса. */
  signal?: AbortSignal;
}

/** Discriminated union — единый стрим-чанк, отнормализованный из Anthropic SSE. */
export type StreamChunk =
  | { kind: 'text-delta'; text: string }
  | { kind: 'thinking-delta'; text: string }
  | { kind: 'tool-use'; id: string; name: string; input: Record<string, unknown> }
  | { kind: 'tool-result'; toolUseId: string; output: unknown; isError?: boolean }
  | {
      kind: 'end';
      stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        thinkingTokens: number;
      };
      model: string;
      latencyMs: number;
    }
  | { kind: 'error'; message: string; retryable: boolean };

/** Описание tool'а для Anthropic API. */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema input'а (вывод из zod через zod-to-json-schema). */
  input_schema: Record<string, unknown>;
}

/** Content blocks — для inline file injection через <document> теги. */
export type ContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | object; is_error?: boolean };
```

### 3.2. ToolCtx (что инжектится сервером в каждый tool-handler)

```ts
// packages/claude-client/src/types.ts (продолжение)

/** Контекст, инжектируемый сервером в каждый tool-handler. Запрещён к передаче от клиента. */
export interface ToolCtx {
  /** ID активной папки. ВСЕГДА из request, не из tool input. */
  folderId: ULID;
  userId: ULID;
  /** UUID v7 текущего turn'а — для логирования и trace. */
  turnId: string;
  /** Папки, явно упомянутые юристом в текущем сообщении через `@<имя>`. */
  mentionedFolders: Array<{ id: ULID; name: string }>;
  /** Drizzle DB instance. */
  db: import('@legal-ai-assistant/db').DbClient;
  /** undici или native fetch — единый http клиент с timeouts/redacts. */
  http: {
    fetch: typeof fetch;
  };
  /** pino child logger с turnId/folderId уже привязаны. */
  logger: import('pino').Logger;
}
```

### 3.3. Public API

```ts
// packages/claude-client/src/index.ts (interface)

export interface ClaudeClient {
  /** Стримит ответ Claude чанками. Ловит retryable errors внутри. */
  streamMessage(opts: StreamMessageOpts): AsyncIterable<StreamChunk>;
}

/** Создаёт клиент по env-конфигу: api | api+proxy | relay. */
export function createClaudeClient(env: ClaudeClientEnv): ClaudeClient;

export interface ClaudeClientEnv {
  transport: ClaudeTransport;
  apiKey: string;
  outboundProxyUrl?: string;
  relayUrl?: string;
  relayToken?: string;
  defaultModel: string;
  defaultEffort: Effort;
  timeoutMs: number;
  maxTokens: number;
}
```

---

## 4. Tool input/output schemas (9 tools)

Все handler'ы — `Tool<I, O>`:

```ts
// packages/claude-tools/src/types.ts

import type { z } from 'zod';

export interface Tool<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  execute(input: I, ctx: ToolCtx): Promise<O>;
}
```

Ниже — конкретные `I` и `O` для каждого из 9 tools.

### 4.1. `search_npa`

```ts
// packages/claude-tools/src/search-npa.ts

export interface SearchNpaInput {
  /** Поисковая фраза, напр. «обязательное страхование автогражданской». */
  query: string;
  /** Тип акта, опционально. */
  doc_type?: 'закон' | 'постановление' | 'указ' | 'приказ' | 'положение' | 'разъяснение';
  /** Дата принятия не раньше (ISO 8601 «YYYY-MM-DD»). */
  date_from?: string;
}

export interface SearchNpaResult {
  title: string;
  /** Внутренний идентификатор pravo.gov.ru (если есть). */
  doc_id?: string;
  /** Дата принятия. */
  date: string;
  /** URL на pravo.gov.ru или fallback (sudact / web_search). */
  url: string;
}

export interface SearchNpaOutput {
  results: SearchNpaResult[];
  /** Откуда взяты результаты: 'pravo-json'|'pravo-html'|'web-fallback'. */
  source: 'pravo-json' | 'pravo-html' | 'web-fallback';
}
```

### 4.2. `fetch_npa_document`

```ts
export interface FetchNpaDocumentInput {
  /** URL pravo.gov.ru или другого зеркала. */
  url: string;
}

export interface NpaArticle {
  /** Номер статьи (или подпункта), напр. «12», «12.1», «1». */
  article_no: string;
  /** Заголовок статьи. */
  title: string;
}

export interface FetchNpaDocumentOutput {
  title: string;
  /** Полный markdown документа (≤60KB). */
  full_text_md: string;
  /** Структура по статьям для навигации. */
  structure: NpaArticle[];
  /** True если контент был обрезан до 60 KB. */
  truncated: boolean;
}
```

### 4.3. `search_court_practice`

```ts
export interface SearchCourtPracticeInput {
  query: string;
  /** Уровень суда. */
  court_level?: 'РС' | 'СПЭ' | 'ВС' | 'арбитр';
  date_from?: string;
}

export interface CourtPracticeResult {
  title: string;
  /** Название суда. */
  court: string;
  /** Дата вынесения. */
  date: string;
  url: string;
  /** Краткая выдержка (snippet). */
  snippet: string;
}

export interface SearchCourtPracticeOutput {
  results: CourtPracticeResult[];
  /** Источники, через которые получены результаты. */
  sources: Array<'sudact' | 'kad-arbitr'>;
  /** True если kad.arbitr.ru не отвечал и пропущен. */
  kad_arbitr_failed: boolean;
}
```

### 4.4. `web_search`

```ts
export interface WebSearchInput {
  query: string;
  /** Количество результатов (default 8, max 16). */
  num_results?: number;
}

export interface WebSearchOutput {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}
```

### 4.5. `fetch_web_page`

```ts
export interface FetchWebPageInput {
  url: string;
}

export interface FetchWebPageOutput {
  title?: string;
  /** Содержимое в markdown. */
  content_md: string;
  status: number;
  mime: string;
  /** True если SSRF guard сработал (не должно случаться, потому что guard throws). */
  blocked?: boolean;
}
```

### 4.6. `read_file_in_folder`

```ts
/**
 * folder_id ВСЕГДА из ctx, поле в input отсутствует.
 */
export interface ReadFileInFolderInput {
  filename: string;
}

export interface ReadFileInFolderOutput {
  filename: string;
  mime: string;
  /** OCR'ный или extract'ный текст. */
  ocr_text: string;
  size_bytes: number;
  ocr_status: OcrStatus;
}
```

### 4.7. `list_folder_contents`

```ts
export type ListFolderContentsInput = Record<string, never>; // {} — folder_id берётся из ctx

export interface ListFolderContentsOutput {
  folder: {
    id: ULID;
    name: string;
    case_type: CaseType;
  };
  files: Array<{
    filename: string;
    mime: string;
    size_bytes: number;
    ocr_status: OcrStatus;
  }>;
}
```

### 4.8. `semantic_search_in_folder`

```ts
export interface SemanticSearchInFolderInput {
  query: string;
  /** default 8, max 16. */
  top_k?: number;
}

export interface SemanticSearchInFolderOutput {
  hits: Array<{
    filename: string;
    /** Текст чанка. */
    chunk: string;
    /** Cosine similarity 0..1 (1 — exact). */
    score: number;
  }>;
}
```

### 4.9. `cross_folder_search`

```ts
/**
 * Жёсткий guard: ctx.mentionedFolders.includes(input.folder_name).
 * Иначе — handler бросает ToolGuardError.
 */
export interface CrossFolderSearchInput {
  /** Имя папки, явно упомянутой через @<имя>. */
  folder_name: string;
  query: string;
  top_k?: number;
}

export interface CrossFolderSearchOutput {
  hits: Array<{
    filename: string;
    chunk: string;
    score: number;
    folder: string;
  }>;
}
```

---

## 5. CaseType YAML schema

```ts
// apps/web/src/lib/case-types/validator.ts

/** Структура одного YAML-файла apps/web/config/case-types/<slug>.yaml. */
export interface CaseTypeDefinition {
  /** Соответствует значению enum CaseType. UPPER_CASE. */
  key: keyof typeof CaseType;
  /** Человекочитаемое название на русском, напр. «ОСАГО (страховое возмещение)». */
  name_ru: string;
  /** Краткое описание для UI (placeholder, tooltips). */
  description: string;
  /** Многострочный system prompt — копируется в `folders.system_prompt` при создании папки. */
  system_prompt: string;
  /** Чек-лист документов, ожидаемых в папке этого типа. */
  document_checklist: string[];
  /** Список применимых НПА с key articles. */
  applicable_npa: Array<{
    /** Внутренний id, напр. '40-FZ'. */
    law_id: string;
    /** Полное название. */
    title: string;
    /** Ключевые статьи, на которые часто ссылаемся. */
    key_articles: Array<string | number>;
  }>;
  /** Tools, доступные по умолчанию для этого типа дел. */
  default_tools: ToolName[];
}

/** Объединение возможных имён tools (см. PBS 6.0). */
export type ToolName =
  | 'search_npa'
  | 'fetch_npa_document'
  | 'search_court_practice'
  | 'web_search'
  | 'fetch_web_page'
  | 'read_file_in_folder'
  | 'list_folder_contents'
  | 'semantic_search_in_folder'
  | 'cross_folder_search';
```

Пример (`apps/web/config/case-types/osago.yaml`):

```yaml
key: OSAGO
name_ru: ОСАГО (страховое возмещение)
description: Дела по обязательному страхованию автогражданской ответственности.
system_prompt: |
  Ты — юридический ассистент по делам ОСАГО. Применимые НПА: ФЗ-40,
  Положение БР №431-П, ППВС №31 от 08.11.2022, гл. 48 ГК РФ,
  Закон РФ №2300-1 ст. 13, 15.
  Уточни у юриста: дата ДТП, СК виновника/потерпевшего, оформление
  (евр/ГИБДД), экспертиза, размер выплаты vs стоимость ремонта,
  претензия+ответ, обращение к финуполномоченному.
  ОБЯЗАТЕЛЬНО: search_court_practice при спорных позициях
  (ОПВ vs ремонт, износ, УТС, неустойка).
document_checklist:
  - Полис ОСАГО (виновника и потерпевшего)
  - Извещение о ДТП / Постановление ГИБДД
  - Акт независимой оценки
  - Калькуляция страховой
  - Отказ страховой / претензия + ответ
  - Решение финансового уполномоченного
applicable_npa:
  - law_id: 40-FZ
    title: ФЗ-40 «Об ОСАГО»
    key_articles: [7, 11, 12, 14, 16.1]
  - law_id: 431-P
    title: Положение БР №431-П
    key_articles: [3.10, 4.15, 4.22]
default_tools:
  - search_npa
  - fetch_npa_document
  - search_court_practice
  - web_search
  - fetch_web_page
  - read_file_in_folder
  - list_folder_contents
  - semantic_search_in_folder
```

---

## 6. API Request/Response (zod)

### 6.1. `/api/files/upload` (POST multipart)

```ts
// apps/web/src/app/api/files/upload/route.ts (фрагмент schema)

import { z } from 'zod';

export const UploadFilesQuery = z.object({
  folderId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'invalid ULID'),
});

/** multipart parsed → нормализованная структура. */
export interface UploadedFileResponse {
  /** ULID нового files row. */
  id: string;
  filename: string;
  /** Final MIME после magic-byte detection. */
  mime: string;
  size_bytes: number;
  sha256: string;
  ocr_status: OcrStatus;
}

export interface UploadFilesResponse {
  files: UploadedFileResponse[];
  /** Файлы, отвергнутые на валидации. */
  rejected: Array<{
    filename: string;
    reason: 'mime' | 'size' | 'duplicate' | 'invalid-name' | 'sandbox';
    detail?: string;
  }>;
}
```

### 6.2. `/api/chat/stream` (POST SSE)

```ts
// apps/web/src/app/api/chat/stream/route.ts

export const ChatStreamRequest = z.object({
  folderId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  /** История + новое user-сообщение. Совместимо с Vercel AI SDK useChat. */
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(50000),
    })
  ).min(1).max(100),
  /** Список ID файлов, явно прикреплённых к сообщению (drag&drop в чат). */
  attachedFileIds: z.array(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)).max(10).optional(),
  effort: z.nativeEnum(Effort).optional(),
});

/** Response — SSE stream. Клиентский useChat сам парсит. */
```

### 6.3. `/api/chat/clear` (POST)

```ts
export const ChatClearRequest = z.object({
  folderId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
});

export interface ChatClearResponse {
  archivedCount: number;
}
```

### 6.4. `/api/chat/compact` (POST)

```ts
export const ChatCompactRequest = z.object({
  folderId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
});

export interface ChatCompactResponse {
  /** Число сообщений, сжатых в summary. */
  archivedCount: number;
  /** Длина summary в токенах. */
  summaryTokens: number;
  summaryMessageId: string;
}
```

### 6.5. `/api/stt` (POST audio blob)

```ts
/** Body — multipart/form-data с полем 'audio' (Blob audio/webm;codecs=opus). */
export interface SttResponse {
  text: string;
  /** Длина оригинальной записи в секундах. */
  durationSec: number;
  provider: 'openai-api' | 'whisper-cpp';
  /** Если Whisper определил язык — указывает. */
  languageDetected?: string;
}
```

### 6.6. `/api/export/docx` (POST)

```ts
export const ExportDocxRequest = z.object({
  messageId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
});

/** Response — application/vnd.openxmlformats-officedocument.wordprocessingml.document */
/** Headers: Content-Disposition: attachment; filename="<folder>-<ts>.docx" */
```

### 6.7. `/api/folders` CRUD

```ts
export const CreateFolderRequest = z.object({
  name: z.string().min(1).max(120).trim(),
  caseType: z.nativeEnum(CaseType),
});

export interface FolderResponse {
  id: string;
  name: string;
  caseType: CaseType;
  effort: Effort;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Только в GET single (не в list). */
  systemPrompt?: string;
}

export const UpdateFolderRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  effort: z.nativeEnum(Effort).optional(),
  systemPrompt: z.string().max(20000).optional(),
});
```

---

## 7. Frontend Stores

### 7.1. UI Store (Zustand)

```ts
// apps/web/src/stores/ui-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** ID текущей открытой папки (отражает route). */
  activeFolderId: string | null;
  /** Сохранённые ширины 3-pane splitter (в %). */
  splitterSizes: { left: number; center: number; right: number };
  /** True пока пользователь тащит файл над окном. */
  dropZoneVisible: boolean;
  /** Тема UI. */
  theme: 'light' | 'dark' | 'system';

  setActiveFolder(id: string | null): void;
  setSplitterSizes(sizes: UiState['splitterSizes']): void;
  setDropZoneVisible(v: boolean): void;
  setTheme(t: UiState['theme']): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeFolderId: null,
      splitterSizes: { left: 22, center: 50, right: 28 },
      dropZoneVisible: false,
      theme: 'system',
      setActiveFolder: (id) => set({ activeFolderId: id }),
      setSplitterSizes: (s) => set({ splitterSizes: s }),
      setDropZoneVisible: (v) => set({ dropZoneVisible: v }),
      setTheme: (t) => set({ theme: t }),
    }),
    { name: 'legal-ai-assistant-ui' }
  )
);
```

### 7.2. Chat Store (Zustand)

```ts
// apps/web/src/stores/chat-store.ts

interface ChatState {
  /** True когда textarea не пустой. */
  isComposing: boolean;
  /** Активна ли запись через VoiceButton. */
  voiceRecording: boolean;
  /** Файлы, прикреплённые к ещё не отправленному сообщению. */
  pendingAttachments: Array<{ id: string; filename: string }>;

  setComposing(v: boolean): void;
  setVoiceRecording(v: boolean): void;
  addAttachment(file: { id: string; filename: string }): void;
  removeAttachment(id: string): void;
  clearAttachments(): void;
}

export const useChatStore = create<ChatState>((set) => ({
  isComposing: false,
  voiceRecording: false,
  pendingAttachments: [],
  setComposing: (v) => set({ isComposing: v }),
  setVoiceRecording: (v) => set({ voiceRecording: v }),
  addAttachment: (file) =>
    set((s) => ({ pendingAttachments: [...s.pendingAttachments, file] })),
  removeAttachment: (id) =>
    set((s) => ({ pendingAttachments: s.pendingAttachments.filter((f) => f.id !== id) })),
  clearAttachments: () => set({ pendingAttachments: [] }),
}));
```

---

## 8. SQL DDL

Полный production DDL — см. [DESIGN_DOC.md §6](./DESIGN_DOC.md#6-storage-schema). Здесь приводится для удобства, идентично:

```sql
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE case_type AS ENUM (
  'OSAGO','DTP','LABOR','FAMILY','INHERITANCE',
  'ADMIN','CRIMINAL','PROCUREMENT','GENERAL'
);
CREATE TYPE ocr_status   AS ENUM ('pending','processing','done','failed','skipped');
CREATE TYPE message_role AS ENUM ('user','assistant','system','tool');
CREATE TYPE effort       AS ENUM ('low','medium','high','max');

CREATE TABLE users (
  id            char(26) PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE folders (
  id             char(26) PRIMARY KEY,
  user_id        char(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  case_type      case_type NOT NULL DEFAULT 'GENERAL',
  system_prompt  text NOT NULL,
  effort         effort NOT NULL DEFAULT 'max',
  archived       boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_folders_user_active ON folders(user_id, archived, updated_at DESC);

CREATE TABLE files (
  id            char(26) PRIMARY KEY,
  folder_id     char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  storage_path  text NOT NULL,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL,
  sha256        char(64) NOT NULL,
  ocr_status    ocr_status NOT NULL DEFAULT 'pending',
  ocr_text      text,
  ocr_error     text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (folder_id, sha256)
);
CREATE INDEX idx_files_folder      ON files(folder_id, created_at DESC);
CREATE INDEX idx_files_ocr_pending ON files(ocr_status) WHERE ocr_status IN ('pending','processing');

CREATE TABLE messages (
  id          char(26) PRIMARY KEY,
  folder_id   char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  turn_id     uuid NOT NULL,
  role        message_role NOT NULL,
  content     text NOT NULL,
  tool_calls  jsonb,
  tokens_in   int,
  tokens_out  int,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_messages_folder ON messages(folder_id, archived, created_at);

CREATE TABLE embeddings (
  id           char(26) PRIMARY KEY,
  file_id      char(26) NOT NULL REFERENCES files(id)   ON DELETE CASCADE,
  folder_id    char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  chunk_index  int NOT NULL,
  content      text NOT NULL,
  embedding    vector(1024) NOT NULL,
  metadata     jsonb,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX idx_embeddings_folder ON embeddings(folder_id);
CREATE INDEX idx_embeddings_hnsw   ON embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

CREATE TABLE sessions (
  id          char(26) PRIMARY KEY,
  user_id     char(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  ip          inet,
  created_at  timestamptz DEFAULT now(),
  revoked_at  timestamptz
);

CREATE TABLE audit_log (
  id                  bigserial PRIMARY KEY,
  turn_id             uuid,
  folder_id           char(26),
  user_id             char(26),
  action              text NOT NULL,
  model               text,
  effort              effort,
  input_tokens        int,
  cache_read_tokens   int DEFAULT 0,
  cache_write_tokens  int DEFAULT 0,
  output_tokens       int,
  thinking_tokens     int DEFAULT 0,
  cost_estimate_usd   numeric(10,6),
  latency_ms          int,
  tool_calls          jsonb,
  payload             jsonb,
  request_id          text,
  ip                  inet,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_folder_time ON audit_log(folder_id, created_at DESC);

CREATE TABLE tool_call_log (
  id                bigserial PRIMARY KEY,
  turn_id           uuid NOT NULL,
  folder_id         char(26) NOT NULL,
  name              text NOT NULL,
  input             jsonb NOT NULL,
  output            jsonb,
  output_truncated  boolean DEFAULT false,
  latency_ms        int,
  error             text,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE npa_search_cache (
  query_hash  char(64) PRIMARY KEY,
  doc_type    text,
  date_from   date,
  results     jsonb,
  fetched_at  timestamptz DEFAULT now()
);
CREATE TABLE npa_doc_cache (
  url_hash      char(64) PRIMARY KEY,
  title         text,
  full_text_md  text,
  structure     jsonb,
  fetched_at    timestamptz DEFAULT now()
);
CREATE TABLE court_search_cache (
  query_hash  char(64) PRIMARY KEY,
  results     jsonb,
  fetched_at  timestamptz DEFAULT now()
);

CREATE TABLE claude_quota (
  id              serial PRIMARY KEY,
  observed_at     timestamptz DEFAULT now(),
  reset_at        timestamptz NOT NULL,
  requests_left   int,
  tokens_left     bigint,
  scope           text
);
```

---

## Cross-references

- Что строим → [PRD.md](./PRD.md)
- Архитектура и решения → [DESIGN_DOC.md](./DESIGN_DOC.md)
- Атомарная декомпозиция файлов → [PBS_ATOMIC.md](./PBS_ATOMIC.md)
- Дорожная карта → [ROADMAP.md](./ROADMAP.md)
- Журнал изменений → [CHANGELOG.md](./CHANGELOG.md)
