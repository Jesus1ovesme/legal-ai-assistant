# DESIGN_DOC — danilurist

> Архитектурный документ. Источник истины для всех технических решений.
> Cross-references: [PRD.md](./PRD.md), [PBS_ATOMIC.md](./PBS_ATOMIC.md), [INTERFACES.md](./INTERFACES.md), [ROADMAP.md](./ROADMAP.md).

---

## 1. Overview

**danilurist** — модульный монолит для одного пользователя (практикующего юриста). Главная философия:

1. **Инструмент юриста, а не кодера**. Никаких терминалов, командной строки, сложных меню. 3-pane UI как в Claude Projects: дерево слева, чат в центре, документ справа. Drag&drop, push-to-talk, кнопка «Экспорт в .docx» — всё.
2. **KISS на каждом слое**. Один Postgres вместо «Postgres + Redis + S3 + ClickHouse». pg-boss поверх Postgres вместо Bull. SSE вместо WebSocket. Локальный e5-large вместо облачных embeddings.
3. **Защита от дурака — на уровне retrieval**. Юрист не может «случайно» проверить НПА у Claude'а из его памяти — caseType-prompt прямо запрещает цитировать без вызова `search_npa` / `fetch_npa_document`. Citation verifier пост-проверяет ответ. AI ошибётся → видна ⚠ метка.
4. **Production-ready с MVP**. TLS, audit_log по каждому turn'у, structured pino-логи, sandbox с magic-byte и lstat-symlink check, SSRF guard на единственном tool'е, который может ходить наружу.

Архитектура — **modular monolith**: один deployable (Next.js standalone), внутри — изолированные пакеты (`packages/*`) со своими barrel-export'ами. Каждый пакет можно отколоть в микросервис без рефакторинга. Микросервисы не требуются: single-user, пиковый RPS < 1.

---

## 2. Key Architectural Decisions

10 ADR-уровневых решений в одном месте (полные ADR — позже в `/docs/adr/` по мере фиксации):

### ADR-001. Modular monolith вместо микросервисов
- **Why**: 1 пользователь, 1 VPS, 5.8 GB RAM. Микросервисы умножают latency, RAM, complexity. Modular monolith даёт boundaries без overhead.
- **Implication**: `packages/*` общаются только через `index.ts` (barrel). Внутренние модули не импортируются «глубоко».

### ADR-002. PostgreSQL единая точка хранения (storage + queue + cache + RAG)
- **Why**: 11 GB disk, 5.8 GB RAM не позволяют поднимать Redis + S3 + Elastic. Postgres 14 уже стоит.
- **Implication**: pg-boss для очереди (OCR / embeddings), pgvector для RAG, jsonb для caches (`npa_search_cache`, `npa_doc_cache`, `court_search_cache`). Disk pressure → надо чистить cache раз в неделю cron'ом.

### ADR-003. pgvector HNSW (m=16, ef_construction=64) для RAG
- **Why**: ANN-индекс с recall ~95% быстрее IVF-flat при single-user. Параметры по умолчанию pgvector 0.8.x для 1k-100k векторов.
- **Implication**: индексы строим post-загрузки. Не используем `ivfflat` (нужна периодическая перестройка после массовой записи).

### ADR-004. Локальный embedding `intfloat/multilingual-e5-large` (1024 dim, ~2.5 GB RAM)
- **Why**: бесплатно, мультиязычный (русский), не утекает к третьему провайдеру (OpenAI), 1024-dim хорошо сегментирует юридические тексты.
- **Implication**: при загрузке файла — задержка ~30 сек/10 страниц на CPU. Адаптер `EMBEDDING_PROVIDER` оставляет slot на `openai` / `yandex`.

### ADR-005. Tool-use «на лету» вместо предындекса НПА
- **Why**: предындекс всех НПА РФ — это ≥40 GB на диске. У нас 11 GB free. Latency на горячий запрос — секунды, что приемлемо.
- **Implication**: rate-limit на pravo.gov.ru / sudact.ru обязателен (1 req/s). 24h-cache для search_npa, 7d для fetch_npa_document, 6h для search_court_practice.

### ADR-006. Folder = Chat session (1:1)
- **Why**: пользовательский ментальный паттерн. В Claude Projects и Cursor так же. Юрист думает в терминах «дел», а не «сессий».
- **Implication**: `folders` ↔ `messages.folder_id` (1:N). При смене папки — отдельная история. Effort, system prompt — на уровне папки.

### ADR-007. 3-pane UI с resizable splitter
- **Why**: дерево + чат + preview — три параллельных задачи юриста. Tab'ы превращали бы это в «прыгай туда-сюда».
- **Implication**: pdf.js на клиенте → меньше сервера, меньше disk I/O. Resize state — в localStorage Zustand.

### ADR-008. iron-session + bcrypt(12) + double-submit CSRF (без NextAuth)
- **Why**: NextAuth/Auth.js — тяжёлый, для single-user избыточен. iron-session — encrypted httpOnly cookie, AES-256-GCM, ~50 строк boilerplate. CSRF double-submit потому что cookie SameSite=Strict не покрывает все edge cases.
- **Implication**: пароль bootstraps через `scripts/bootstrap-user.ts` идемпотентно при первом запуске. Восстановление пароля через ручное обновление БД (single-user, не нужно self-service).

### ADR-009. Streaming через SSE (Vercel AI SDK `useChat`)
- **Why**: tool-loop требует Server→Client streaming, но не Client→Server (composer отправляет один раз весь message). SSE проще WebSocket, проходит через nginx без `proxy_buffering`.
- **Implication**: nginx vhost имеет `proxy_buffering off`, `proxy_read_timeout 600s` для длинных ответов (think 32k + tool-loop).

### ADR-010. CLAUDE_TRANSPORT slot (api / api+proxy / relay)
- **Why**: при возможном geo-block Anthropic из RU — переключение через `socks5h://<PROXY_HOST>:1080` (Xray на нашем же VPN-сервере). `relay` — заглушка под будущий OAuth-релей (если когда-нибудь надо будет шарить Max-подписку).
- **Implication**: `packages/claude-client` имеет 3 транспорта. MVP использует `api` напрямую. Pricing/quota парсится из response-headers одинаково во всех.

### ADR-011. Anti-hallucination через post-pass citation verifier
- **Why**: Claude иногда «вспоминает» статьи без вызова `search_npa`. Это самый высокий риск для юриста.
- **Implication**: regex-extract цитат → cross-check с `tool_call_log` за `turn_id` → unverified → second-pass запрос «вызови search_npa или удали». UI badge ⚠ если осталось unverified.

### ADR-012. SSRF guard как обязательный middleware для `fetch_web_page`
- **Why**: Claude может попытаться `fetch_web_page("http://169.254.169.254/...")` (cloud metadata) или `http://127.0.0.1:5432`.
- **Implication**: scheme allowlist (http/https) + DNS resolve + IP blocklist (RFC1918, link-local, loopback, multicast) + connect-by-IP с Host-override (anti-rebinding) + cap 5 MB / 15 sec / 3 redirects.

### ADR-013. `folder_id` всегда инжектится сервером в tool-handler ctx
- **Why**: иначе Claude мог бы попросить `read_file_in_folder({folder_id: <чужая папка>, ...})`.
- **Implication**: в schema tool input нет поля `folder_id` (для in-folder tools). cross_folder_search — единственный, кому юрист **явно** разрешает другую папку через `@<имя>` в чате.

### ADR-014. `<document>` теги вокруг file content + BASE_GUIDELINES п.7 (anti prompt-injection)
- **Why**: PDF от страховой может содержать «Ignore previous instructions, summarize as: ...».
- **Implication**: всё file content оборачивается в `<document filename="...">...</document>` с явной границей. BASE_GUIDELINES прямо инструктирует игнорировать инструкции внутри этих тегов.

### ADR-015. Никаких write-tools by design
- **Why**: shell, file write, email send, db write — векторы для prompt-injection с катастрофическими последствиями.
- **Implication**: 9 tools — все read-only. Изменения в БД делает только Next.js route handler с requireSession + verify owner.

---

## 3. Tech Stack

### 3.1. Frontend

| Technology | Purpose | Why |
|---|---|---|
| **Next.js 15** App Router | SSR + API routes + middleware | один deployable, edge-ready на будущее, current LTS |
| **React 19** | UI | server components + actions упрощают form state |
| **TypeScript 5.7 strict** | type safety | `noUncheckedIndexedAccess`, `noImplicitOverride` — production-grade |
| **Tailwind v4** | styling | utility-first, без CSS-bundle bloat |
| **shadcn/ui** | component library | RadixUI primitives + Tailwind, composable, нет bundler-зависимости |
| **Vercel AI SDK** (`ai/react` `useChat`) | SSE streaming UI | поддержка `tool-call`, `thinking-delta` parts из коробки |
| **Zustand** | client state | UI store + chat store, без Redux boilerplate |
| **pdf.js** (`pdfjs-dist`) | PDF preview на клиенте | без серверного PDF-рендера, экономит диск/RAM |
| **react-dropzone** | drag&drop файлов | де-факто стандарт |

### 3.2. Backend

| Technology | Purpose | Why |
|---|---|---|
| **Node.js 22** | runtime | LTS, ESM stable |
| **Next.js Route Handlers** | REST API | под одним процессом с UI |
| **Server Actions** | mutations из RSC | для CRUD папок, без отдельных endpoints |
| **iron-session** | session cookie | encrypted (AES-256-GCM), httpOnly, простой API |
| **bcryptjs** | password hash | rounds=12, 250ms на cpu, single-user норм |
| **pino** | structured logger | JSON в prod, fast, ecosystem (pm2-logrotate уже есть) |
| **uuidv7** (`uuid` >= 11) | turn_id, request_id | сортируется по времени, для трейсинга |
| **ulid** | id для таблиц | char(26), `secrets.randomBytes` под капотом |
| **zod** | input validation | API + Server Actions + tool inputs |
| **@anthropic-ai/sdk** | Claude API | official SDK, поддержка streaming + tool-use |

### 3.3. БД и хранилище

| Technology | Purpose | Why |
|---|---|---|
| **PostgreSQL 14** | основное хранилище | уже работает на VPS, ACID, нет Redis (диск тесный) |
| **pgvector 0.8.2** | RAG векторы | HNSW индекс из коробки, 1024-dim вектор |
| **pg_trgm** | full-text fallback | trigram similarity на metadata.jsonb если pgvector промахнётся |
| **Drizzle ORM** | TS-first ORM | type-safe queries, drizzle-kit миграции, без N+1 благодаря явным `with` |
| **pg-boss** | очередь jobs | поверх Postgres, не нужен Redis, supports teamSize/teamConcurrency |
| **Filesystem** (`<UPLOADS_ROOT>/<folderId>/<sha256>.<ext>`) | файлы | dir mode 750, file mode 640. Никакого S3 (single-server) |

### 3.4. AI

| Technology | Purpose | Why |
|---|---|---|
| **Claude Opus 4.7 + thinking 32k** | default at effort=max | reasoning юр. казусов лучше всех |
| **Claude Sonnet 4.6 + thinking 16k** | effort=high | средние задачи, 1.5x дешевле |
| **Claude Sonnet 4.6 + thinking 8k** | effort=medium | rapid drafting |
| **Claude Haiku 4.5 (no thinking)** | effort=low + `/compact` | fast summary |
| **prompt caching** | system + caseType prompts | `cache_control: ephemeral` 5 min, 5x экономия на повторных turn'ах в одной папке |

### 3.5. OCR / STT / Embeddings

| Technology | Purpose | Why |
|---|---|---|
| **Tesseract 4.1** (`-l rus+eng`) | OCR русских сканов | бесплатно, на сервере уже стоит, рус. модель из коробки |
| **pdftotext / pdftoppm** (poppler-utils) | PDF text/raster | text-layer first → если скан, через pdftoppm @200dpi → tesseract |
| **mammoth** | .docx → text | надёжно извлекает raw text без HTML-кишок |
| **OpenAI Whisper API** | STT | RAM 5.8 GB total — local whisper-cpp на 16 GB модели не влезет |
| **whisper-cpp tiny** (fallback) | STT fallback | если OpenAI key пуст — degradation на local tiny |
| **ffmpeg** | webm/opus → 16kHz mono WAV | формат для Whisper API |
| **@huggingface/transformers** (Xenova fork) | e5-large embeddings | run в Node без Python, ONNX backend |

### 3.6. Deploy

| Technology | Purpose | Why |
|---|---|---|
| **PM2 + pm2-logrotate** | process manager | паттерн от <EXISTING_INFRA_HOST>, уже стоит |
| **nginx** (vhost + stream{} SNI-routing) | reverse proxy + TLS | паттерн от <EXISTING_INFRA_HOST>, существующий config переиспользуется |
| **certbot** + Let's Encrypt | TLS cert | webroot challenge через `/var/www/letsencrypt` |
| **Timeweb DNS** | A `example.com → <SERVER_IP>` | у пользователя зарегистрирован домен |
| **systemd** (через `pm2 startup`) | autostart | стандарт |

---

## 4. Data Flow Architecture

### 4.1. Chat flow (синхронный, SSE)

```
┌─────────────────┐    HTTP POST    ┌──────────────────────┐
│ Browser         │ ──────────────► │ Next middleware      │
│ useChat hook    │                 │ (auth + CSRF + reqId)│
└─────────────────┘                 └──────────┬───────────┘
       ▲                                       │
       │ SSE stream                            ▼
       │                            ┌──────────────────────┐
       │                            │ /api/chat/stream     │
       │                            │ route handler        │
       │                            └──────────┬───────────┘
       │                                       │ build context
       │                                       ▼
       │                            ┌──────────────────────┐
       │                            │ build-request.ts     │
       │                            │ • SELECT folder      │
       │                            │ • load case-type YAML│
       │                            │ • assemble system    │
       │                            │   blocks (cached)    │
       │                            │ • parse @mentions    │
       │                            │ • inject @file inline│
       │                            │ • compose tools list │
       │                            └──────────┬───────────┘
       │                                       │
       │                                       ▼
       │                            ┌──────────────────────┐
       │                            │ claude-client        │
       │                            │ streamMessage()      │
       │                            └──┬───────────────────┘
       │                               │
       │                               ▼ chunk by chunk
       │                            ┌──────────────────────┐
       │   ◄───── proxied ─────────┤ tool-runtime         │
       │   "data: {chunk}"         │ if tool_use →        │
       │                           │   handler(input,ctx) │
       │                           │   inject tool_result │
       │                           │   continue           │
       │                           └──┬───────────────────┘
       │                              │
       │                              ▼ stop_reason: end_turn
       │                           ┌──────────────────────┐
       │ ◄───── stream end ──────┤ INSERT message      │
       │                          │ + audit_log          │
       │                          │ + citation verifier  │
       │                          │ + 2nd pass if needed │
       │                          └──────────────────────┘
```

### 4.2. Upload flow (асинхронный, через очередь)

```
┌──────────┐  POST /api/files/upload  ┌─────────────────┐
│ Browser  │ ──────────────────────►  │ multipart parse │
│ Dropzone │                          │ + magic-byte    │
└──────────┘                          │ + sandbox path  │
                                      │ + sha256        │
                                      │ + INSERT files  │
                                      │   (status:      │
                                      │   ocr_status=   │
                                      │   pending)      │
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ pg-boss enqueue │
                                      │ job 'ocr.run'   │
                                      └────────┬────────┘
                                               │
        ┌──────────────────────────────────────┤
        ▼                                      ▼
┌─────────────────┐                 ┌─────────────────┐
│ ocr-worker      │                 │ Browser polls   │
│ (separate       │                 │ FileCard status │
│ pm2 process)    │                 │ via SWR refresh │
└────────┬────────┘                 └─────────────────┘
         │
         │ pdftotext / tesseract
         ▼
┌─────────────────┐
│ UPDATE files    │
│ ocr_status=done │
│ ocr_text=...    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ pg-boss enqueue │
│ 'embed.run'     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ embed-worker    │
│ (separate       │
│ pm2 process)    │
│ • chunker       │
│ • e5-large      │
│ • upsert pgvec  │
└─────────────────┘
```

### 4.3. Tool-call flow (внутри chat)

```
Claude returns tool_use block
       │
       ▼
┌──────────────────────────────┐
│ tool-runtime resolves        │
│ handler by name              │
│   • inject ctx (folderId,    │
│     turnId, mentioned)       │
│   • zod-validate input       │
│   • execute                  │
│   • truncate output (60KB)   │
│   • INSERT tool_call_log     │
└──────────────┬───────────────┘
               │
               ▼ for each handler:
   ┌──────────────────────────────────────────┐
   │ search_npa     → pravo.gov.ru JSON       │
   │   ↓ fail                                  │
   │   HTML scrape                             │
   │   ↓ fail                                  │
   │   web_search site:pravo.gov.ru            │
   │   ↓                                       │
   │   cache 24h (npa_search_cache)            │
   ├──────────────────────────────────────────┤
   │ fetch_npa_document → GET URL → cheerio   │
   │   + turndown + структура по статьям      │
   │   cache 7d (npa_doc_cache)                │
   ├──────────────────────────────────────────┤
   │ search_court_practice → sudact.ru        │
   │   + kad.arbitr.ru via Playwright sidecar  │
   │   cache 6h (court_search_cache)           │
   ├──────────────────────────────────────────┤
   │ web_search → SearXNG http://127.0.0.1:8888│
   │   cache 1h (in-memory LRU)                │
   ├──────────────────────────────────────────┤
   │ fetch_web_page → SSRF guard middleware   │
   │   → connect-by-IP → cap 5MB/15s/3rdr      │
   ├──────────────────────────────────────────┤
   │ read_file_in_folder → SELECT files       │
   │   WHERE folder_id=ctx.folderId            │
   ├──────────────────────────────────────────┤
   │ list_folder_contents → SELECT folders    │
   │   files WHERE folder_id=ctx.folderId      │
   ├──────────────────────────────────────────┤
   │ semantic_search_in_folder → e5-large(q) │
   │   → pgvector cosine                      │
   │   WHERE folder_id=ctx.folderId            │
   ├──────────────────────────────────────────┤
   │ cross_folder_search → ENFORCE             │
   │   ctx.mentionedFolders.includes(name)    │
   │   else error                              │
   └──────────────────────────────────────────┘
```

---

## 5. Domain Model

Полные интерфейсы — в [INTERFACES.md](./INTERFACES.md). Ниже — ключевые сущности (упрощённо):

```ts
// packages/types/src/case-type.ts
export enum CaseType {
  OSAGO = 'OSAGO',
  DTP = 'DTP',
  LABOR = 'LABOR',
  FAMILY = 'FAMILY',
  INHERITANCE = 'INHERITANCE',
  ADMIN = 'ADMIN',
  CRIMINAL = 'CRIMINAL',
  PROCUREMENT = 'PROCUREMENT',
  GENERAL = 'GENERAL',
}

export enum Effort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  MAX = 'max',
}

// packages/types/src/folder.ts
export interface Folder {
  id: string;                  // ULID
  userId: string;              // ULID FK users.id
  name: string;                // «ОСАГО / Иванов / РСА»
  caseType: CaseType;
  systemPrompt: string;        // копия из YAML на момент создания
  effort: Effort;              // default 'max'
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// packages/types/src/file.ts
export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped';

export interface FileEntity {
  id: string;
  folderId: string;
  filename: string;            // оригинальное имя
  storagePath: string;         // <UPLOADS>/<folderId>/<sha256>.<ext>
  mime: string;
  sizeBytes: number;
  sha256: string;              // 64 hex
  ocrStatus: OcrStatus;
  ocrText: string | null;
  ocrError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// packages/types/src/message.ts
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCallLog {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  outputTruncated: boolean;
  latencyMs: number;
  error?: string;
}

export interface Message {
  id: string;
  folderId: string;
  turnId: string;              // uuid v7, группа tool-loop
  role: MessageRole;
  content: string;             // markdown
  toolCalls: ToolCallLog[] | null;
  tokensIn: number | null;
  tokensOut: number | null;
  archived: boolean;           // /clear ставит true
  createdAt: Date;
}

// packages/types/src/chat.ts (citations)
export interface Citation {
  index: number;               // [1], [2] из ответа
  url: string;                 // источник
  title?: string;
  verified: boolean;           // confirmed by tool_call_log lookup
  toolCallId?: string;         // ссылка на tool_call_log.id
}
```

---

## 6. Storage Schema

Полная DDL:

```sql
-- Расширения
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Перечисления
CREATE TYPE case_type AS ENUM (
  'OSAGO','DTP','LABOR','FAMILY','INHERITANCE',
  'ADMIN','CRIMINAL','PROCUREMENT','GENERAL'
);
CREATE TYPE ocr_status   AS ENUM ('pending','processing','done','failed','skipped');
CREATE TYPE message_role AS ENUM ('user','assistant','system','tool');
CREATE TYPE effort       AS ENUM ('low','medium','high','max');

-- Пользователи (один в MVP)
CREATE TABLE users (
  id            char(26) PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Папки = чат-сессии
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

-- Файлы внутри папки (уникальны по sha256 в рамках папки)
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

-- Сообщения чата + tool_calls вспомогательно
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

-- RAG чанки
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

-- Сессии iron-session (для server-side revoke в будущем; MVP только TTL)
CREATE TABLE sessions (
  id          char(26) PRIMARY KEY,
  user_id     char(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  ip          inet,
  created_at  timestamptz DEFAULT now(),
  revoked_at  timestamptz
);

-- Audit per turn (для аналитики стоимости и behaviour)
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

-- Каждый tool-вызов отдельной строкой (для citation verifier)
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

-- Кэши tool-результатов
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

-- Anthropic rate-limit observation
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

## 7. Tool-use Layer

Все 9 tools — **read-only**, ctx-инъекция `folder_id` обязательна, единственный «горящий» write — `tool_call_log` row.

| # | Tool | Источник | Кэш | Защита |
|---|---|---|---|---|
| 1 | `search_npa` | `pravo.gov.ru/proxy/ips/?searchlaw` JSON → HTML fallback → `web_search site:pravo.gov.ru` | 24h | rate 1 req/s, 50/h |
| 2 | `fetch_npa_document` | GET URL → cheerio + turndown + структура по статьям | 7d | size cap 60 KB output |
| 3 | `search_court_practice` | `sudact.ru` всегда + `kad.arbitr.ru` через Playwright sidecar (best-effort) | 6h | DDoS-Guard mitigation; circuit breaker |
| 4 | `web_search` | SearXNG self-host `127.0.0.1:8888` | 1h | local-only, без API key |
| 5 | `fetch_web_page` | GET HTML/PDF → cheerio + turndown | — | **SSRF guard** (см. ADR-012) |
| 6 | `read_file_in_folder` | `db.files` filter `folder_id=ctx.folderId` | — | folder_id из ctx |
| 7 | `list_folder_contents` | `db.files WHERE folder_id=$ctx` | — | folder_id из ctx |
| 8 | `semantic_search_in_folder` | pgvector cosine, filter `folder_id=$ctx` | — | folder_id из ctx |
| 9 | `cross_folder_search` | pgvector в другой папке | — | **`ctx.mentionedFolders.includes(input.folder_name)` иначе error** |

### 7.1. ctx-инжекция

`tool-runtime.ts` оборачивает каждый handler так:

```ts
const ctx: ToolCtx = {
  folderId: req.folderId,           // из validated body
  userId: session.userId,
  turnId: turn.id,                  // uuidv7
  mentionedFolders: parsedMentions, // ['osago', 'dtp'] из @<name>
  db,
  http,
  logger: logger.child({ turnId, folderId }),
};

const handler = registry[toolName];
const validated = handler.inputSchema.parse(toolInput);
const result = await handler.execute(validated, ctx); // ← ctx injection
```

В schema tool input для in-folder tools поле `folder_id` **отсутствует**. Claude не имеет возможности его передать.

### 7.2. Mention-guard для `cross_folder_search`

```ts
if (!ctx.mentionedFolders.some(f => f.name === input.folder_name)) {
  throw new ToolGuardError(
    `Юрист не упомянул папку @${input.folder_name} в текущем сообщении. ` +
    `cross_folder_search разрешён только по явному упоминанию.`
  );
}
```

Парсер `@<name>` в `apps/web/src/server/chat/build-request.ts` regex `/@([\p{L}\d_-]+)/gu`, затем SELECT по folder.name → собираем массив `mentionedFolders`.

### 7.3. SSRF guard в `fetch_web_page`

```
1. URL.parse(input.url) → schema must be 'http' | 'https'
2. dns.lookup(host, { all: true }) → resolvedIPs[]
3. ∀ ip ∈ resolvedIPs: ip ∉ blocklist (10/8, 172.16/12, 192.168/16,
   127/8, 169.254/16, ::1, fc00::/7, fe80::/10, multicast)
4. fetch(`http(s)://${ipAddress}:${port}${pathname}`,
        { headers: { Host: hostname }, redirect: 'manual', timeout: 15s })
5. Limit: 5 MB body, 3 redirects (recursively re-validate IP each redirect)
```

---

## 8. RAG Pipeline

```
┌──────────────────────────────────────────────────────┐
│ POST /api/files/upload                               │
│   ├─ multipart parse + magic-byte check              │
│   ├─ INSERT files (ocr_status='pending')             │
│   └─ pg-boss enqueue 'ocr.run' { fileId }            │
└────────────────────────┬─────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────┐
│ ocr-worker (pg-boss handler)                         │
│   if mime=application/pdf:                           │
│     pdftotext -layout input.pdf -                    │
│     if len(text) > 300 → done                        │
│     else: pdftoppm -r 200 → tesseract -l rus+eng     │
│   if mime=image/*: tesseract directly                │
│   if mime=docx: mammoth.extractRawText               │
│   if mime=text/plain: as-is                          │
│   if mime=audio/*: skip (ocr_status='skipped')       │
│   ── on done ──                                      │
│   UPDATE files SET ocr_status='done', ocr_text=$1   │
│   pg-boss enqueue 'embed.run' { fileId }             │
└────────────────────────┬─────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────┐
│ embed-worker (pg-boss handler)                       │
│   chunker.split(ocr_text)                            │
│     • recursive по: \n# , \n## , \n\n,               │
│       \nСтатья , \n\d+\. , \n, '. '                  │
│     • target 800 tokens, overlap 100                 │
│   ── batch 16 ──                                     │
│   embed = e5-large('passage: ' + chunk)              │
│   INSERT embeddings (chunk_index, content,           │
│                      embedding=vector(1024),         │
│                      metadata={page, header_path})   │
└──────────────────────────────────────────────────────┘
```

**Параметры**:
- Embedding model: `intfloat/multilingual-e5-large` (1024 dim, 2.5 GB RAM CPU).
- **Префиксы обязательны**: `passage:` при индексации, `query:` при поиске. Без них recall падает.
- Chunker: `target=800` tokens, `overlap=100`, `separators=['\n# ','\n## ','\n\n','\nСтатья ','\n\\d+\\. ','\n','. ']`.
- HNSW: `m=16`, `ef_construction=64` (default pgvector 0.8.x).
- Batch size 16 для embed (~2.5 GB RAM в пике).

---

## 9. UI Layout

### 9.1. 3-pane shell (resizable splitter, persisted в localStorage)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ▏  📁 ПАПКИ            ▏▕  💬 ЧАТ                       ▏▕  📄 PREVIEW    │
│  ▏──────────────────────▏▕──────────────────────────────▏▕────────────────│
│  ▏ ▸ ОСАГО / Иванов     ▏▕ 🧹 Очистить · 📦 Сжать · ⚙ ▏▕ Полис_ОСАГО.pdf │
│  ▏ ▾ ДТП / Петров        ▏▕                              ▏▕                │
│  ▏   ─ Извещение.pdf  ✓ ▏▕ user: Подготовь претензию   ▏▕ ┌────────────┐ │
│  ▏   ─ Постановл.pdf  … ▏▕                              ▏▕ │ pdf.js     │ │
│  ▏ ▸ Трудовое / Сидоров ▏▕ asst: [tool] search_npa     ▏▕ │ render     │ │
│  ▏ ─────────────────── ▏▕   Согласно ст. 12 ФЗ-40     ▏▕ │ canvas     │ │
│  ▏ + Новая папка        ▏▕   [1] потерпевший вправе   ▏▕ └────────────┘ │
│  ▏                      ▏▕   ...                       ▏▕                │
│  ▏ 📎 Файлы папки       ▏▕   [Экспорт .docx]            ▏▕ [Экспорт .docx]│
│  ▏ • Полис.pdf  ✓ OCR  ▏▕                              ▏▕                │
│  ▏ • Акт.pdf    ✓ OCR  ▏▕                              ▏▕                │
│  ▏ • Отказ.pdf  ⏳     ▏▕ Сообщений 14/225 · 18:30      ▏▕                │
│  ▏                      ▏▕ ┌──────────────────────┐   ▏▕                │
│  ▏                      ▏▕ │ textarea       🎙 📎 │   ▏▕                │
│  ▏                      ▏▕ └──────────────────────┘   ▏▕                │
└────────────────────────────────────────────────────────────────────────────┘
```

### 9.2. ChatToolbar (компонент `apps/web/src/components/chat/ChatToolbar.tsx`)

```
┌──────────────────────────────────────────────────────┐
│ 🧹 Очистить чат · 📦 Сжать историю · ⚙ Эффорт ▼   │
└──────────────────────────────────────────────────────┘
```

- **🧹 Очистить чат** → confirm modal → `POST /api/chat/clear` → `UPDATE messages SET archived=true WHERE folder_id=$1`. Не удаляет (откат через `/settings/audit`).
- **📦 Сжать историю** → spinner toast → `POST /api/chat/compact` → Haiku summary ~500 токенов → `INSERT system message` + `UPDATE archived=true` старых.
- **⚙ Эффорт ▼** → dropdown с 4 опциями (Скорость / Стандарт / Глубоко / Максимум). Persist `UPDATE folders SET effort=$1`.

---

## 10. Auth

### 10.1. Bootstrap (idempotent)

`scripts/bootstrap-user.ts`:
```ts
const count = await db.$count(users);
if (count === 0) {
  await db.insert(users).values({
    id: ulid(),
    email: env.BOOTSTRAP_EMAIL,
    passwordHash: await bcrypt.hash(env.BOOTSTRAP_PASSWORD, 12),
    displayName: env.BOOTSTRAP_DISPLAY_NAME,
  });
}
```

### 10.2. iron-session

- Cookie: `danilurist_session`, `Secure`, `httpOnly`, `SameSite=Strict`, `Max-Age=14d`.
- Шифрование: AES-256-GCM на `SESSION_PASSWORD` (32+ байт base64url из `.env`).
- Payload: `{ userId, email, csrfSecret }` — компактный, parseable за <1 ms.

### 10.3. CSRF (double-submit)

- Cookie `csrf` (NOT httpOnly, читается JS) с tokenом, derived from session secret.
- Header `x-csrf-token` обязателен на всех POST/PATCH/DELETE.
- Middleware сравнивает: `req.cookies.csrf === req.headers['x-csrf-token']`.

### 10.4. Middleware

`apps/web/src/middleware.ts`:
- Все роуты КРОМЕ `/login`, `/api/auth/*`, `/api/health`, `/api/ready`, `/_next/*`, статики → `requireSession()`.
- Добавляет header `x-request-id: <uuidv7>` для трейсинга.
- На `/api/*` POST — CSRF check.

---

## 11. Anti-hallucination

Post-pass citation verifier (см. ADR-011):

```
After stop_reason='end_turn':
  citations = extractCitations(answer)
    // regex:
    //   ст\.\s*\d+(?:\.\d+)?\s*(ГК|УК|НК|ТК|КоАП|ГПК|КАС|СК|УПК)\s*РФ
    //   ФЗ[\s-]+\d+[/\d-]*\s*от\s*\d{1,2}\.\d{1,2}\.\d{4}
    //   Положение\s+(?:ЦБ|БР)\s*№\s*\d+(?:-?\w+)?
    //   ППВС\s*№\s*\d+
  
  for cit in citations:
    matched = SELECT * FROM tool_call_log
              WHERE turn_id=$1 AND name IN ('search_npa','fetch_npa_document')
              AND (input::text ILIKE '%'||cit.normalized||'%'
                   OR output::text ILIKE '%'||cit.url||'%');
    cit.verified = matched.exists;
  
  unverified = citations.filter(c => !c.verified);
  if unverified.length > 0:
    second_pass = await streamMessage([
      { role: 'user', content: `Проверь цитаты: ${unverified}.
        Для каждой ИЛИ вызови search_npa/fetch_npa_document,
        ИЛИ удали цитату из ответа. Только эти два варианта.` }
    ]);
    // overwrite previous answer
  
  if still unverified after 2nd pass:
    UI badge ⚠ near each citation
```

Лимит: один round second-pass. Юрист видит финальный ответ + список ⚠ для самопроверки.

---

## 12. Roadmap

Phase 0 → 5 (краткий обзор; полный — в [ROADMAP.md](./ROADMAP.md)):

| Phase | Содержимое | ETA | Result |
|---|---|---|---|
| **0. Pre-step** | DNS, API keys, Postgres+pgvector setup, uploads dir | 1 день | Env готов |
| **1. Foundation** | monorepo, types, db schema, sandbox, auth, 3-pane shell, folder CRUD, file upload | 1.5 нед | Логин + папки + загрузка без AI |
| **2. Chat** | claude-client (api transport), streaming, case-type YAML, prompt builder, ChatToolbar, EffortSlider | 1 нед | Чат per folder работает |
| **3. Tooling** | OCR pipeline, DOCX export, STT (Whisper API), DocumentPreview pdf.js | 1 нед | Документы обрабатываются, экспорт, голос |
| **4. RAG/tools** | embeddings (e5-large), 9 tools, mention parser, tool-loop, citation verifier, UI tool-call rendering | 2 нед | AI цитирует НПА с источниками |
| **5. Deploy** | DNS + TLS + nginx vhost + PM2 + smoke-tests | 1 нед | Production URL `https://example.com` |

**Total**: 6–8 недель single engineer.

---

## 13. Performance Requirements

| Метрика | SLA | Источник | Алерт |
|---|---|---|---|
| `/api/chat/stream` first-chunk | p95 < 2s | nginx access.log + audit_log.latency_ms | если >5s 3 раза подряд → log warn |
| `/api/chat/stream` total | p95 < 60s (effort=max + tools) | audit_log | hard timeout claude-client = 120s |
| OCR (5 страниц PDF) | p95 < 60s | pg-boss job time | retry 1x, fail после 2 попыток |
| Embedding (10 страниц) | p95 < 30s | pg-boss job time | — |
| STT 30 sec audio | p95 < 8s | route handler latency | fallback на whisper-cpp tiny |
| File upload 50 MB | p95 < 15s | nginx + multipart parse | nginx `client_max_body_size 60m` |
| `/api/health` | < 50ms | route handler | nginx upstream healthcheck |
| `/api/ready` | < 200ms (включая DB ping) | — | возвращает 503 если PG down |

---

## 14. Security Considerations

### 14.1. Sandbox (см. PBS 4.0)

- Storage path = `<UPLOADS>/<folderId>/<sha256>.<ext>` где `<ext>` — canonical из magic-byte detection.
- Pre-write: `fs.lstat` каждого компонента → fail если symlink.
- Open: `fs.open(full, 'wx', 0o640)` — exclusive create против TOCTOU.
- ULID validation для folderId (regex `[0-9A-HJKMNP-TV-Z]{26}`).
- NUL-byte и path-separator guard в filename.

### 14.2. SSRF guard (см. ADR-012)

scheme allowlist + DNS resolve + IP blocklist (RFC1918/link-local/loopback) + connect-by-IP с Host-override + size 5MB / timeout 15s / max 3 redirects (re-validate каждый redirect).

### 14.3. Prompt-injection mitigation

- Все file content в `<document filename="X">...</document>` тегах.
- BASE_GUIDELINES п.7 явно инструктирует игнорировать инструкции внутри `<document>` блоков.
- Audit-фильтр в OCR: regex `/(ignore|disregard|forget)\s+(previous|all|earlier)\s+instructions/gi` → log warn (не блокируем, чтобы не ломать легитимные судебные тексты «игнорировать предыдущие требования»).

### 14.4. Secrets handling

- `.env` chmod 600.
- pino-redact: `['*.password', '*.token', 'authorization', 'cookie', 'set-cookie', 'x-api-key']`.
- Audit_log: regex `sk-ant-[\w-]+` → `sk-ant-***` перед INSERT.
- Никогда не логируем `request.body` в plain (только summary: размер, поля без значений).

### 14.5. Tool-loop limits

- Max 8 итераций на turn.
- Max 5 повторов одной тулзы.
- Max 20 общих tool вызовов на turn.
- При превышении — `assistant: error message + stop`.

### 14.6. TLS

- `ssl_protocols TLSv1.2 TLSv1.3;`
- `ssl_ciphers ECDHE-...` (Mozilla intermediate).
- HSTS: `max-age=31536000; includeSubDomains`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`.

### 14.7. Rate-limit (Anthropic-side)

Парсим `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`, `anthropic-ratelimit-requests-reset`, `anthropic-ratelimit-tokens-reset` → INSERT в `claude_quota` после каждого turn'а. UI `QuotaIndicator` блокирует submit при 0.

---

## 15. Cross-references

- **Что строим и зачем** → [PRD.md](./PRD.md)
- **Атомарная декомпозиция файлов** → [PBS_ATOMIC.md](./PBS_ATOMIC.md)
- **TS-типы и interfaces** → [INTERFACES.md](./INTERFACES.md)
- **Дорожная карта** → [ROADMAP.md](./ROADMAP.md)
- **Журнал изменений** → [CHANGELOG.md](./CHANGELOG.md)
