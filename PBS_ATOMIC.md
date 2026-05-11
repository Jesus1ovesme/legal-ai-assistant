# PBS_ATOMIC — legal-ai-assistant

> Product Breakdown Structure до атомарного уровня (файл / функция / интерфейс).
> Cross-references: [PRD.md](./PRD.md), [DESIGN_DOC.md](./DESIGN_DOC.md), [INTERFACES.md](./INTERFACES.md), [ROADMAP.md](./ROADMAP.md).
>
> Каждый лист дерева = конкретный файл. Под каждым PBS X.0 — таблица «Files to create» с примерным числом строк.

---

## Оглавление

- [PBS 1.0  Infrastructure](#pbs-10-infrastructure)
- [PBS 2.0  packages/types](#pbs-20-packagestypes)
- [PBS 3.0  packages/db](#pbs-30-packagesdb)
- [PBS 4.0  packages/sandbox](#pbs-40-packagessandbox)
- [PBS 5.0  packages/claude-client](#pbs-50-packagesclaude-client)
- [PBS 6.0  packages/claude-tools](#pbs-60-packagesclaude-tools)
- [PBS 7.0  packages/embeddings](#pbs-70-packagesembeddings)
- [PBS 8.0  packages/{ocr, stt, docx-export, ui}](#pbs-80-packagesocr-stt-docx-export-ui)
- [PBS 9.0  apps/web — auth + middleware](#pbs-90-appsweb-auth--middleware)
- [PBS 10.0 apps/web — App Router pages + API routes](#pbs-100-appsweb-app-router-pages--api-routes)
- [PBS 11.0 apps/web — UI components (3-pane)](#pbs-110-appsweb-ui-components-3-pane)
- [PBS 12.0 apps/web — workers (pg-boss)](#pbs-120-appsweb-workers-pg-boss)
- [PBS 13.0 Build & Distribution](#pbs-130-build--distribution)

---

## PBS 1.0 Infrastructure

```
1.0 Infrastructure
├── 1.1 package.json (root)
│   └── ./package.json — workspace, scripts, devDeps
├── 1.2 pnpm-workspace.yaml
│   └── ./pnpm-workspace.yaml — apps/* + packages/*
├── 1.3 turbo.json
│   └── ./turbo.json — pipelines build/dev/lint/typecheck/test
├── 1.4 tsconfig.base.json
│   └── ./tsconfig.base.json — strict, paths aliases для @legal-ai-assistant/*
├── 1.5 tsconfig.json (root composite)
│   └── ./tsconfig.json — references на пакеты
├── 1.6 .env.example
│   └── ./.env.example — все ENV-переменные (полный список)
├── 1.7 .env (production secrets, chmod 600)
│   └── ./.env (не коммитим, gitignore)
├── 1.8 .gitignore
│   └── node_modules, dist, .next, .turbo, .env, uploads/, logs/, .cache/
├── 1.9 .eslintrc.cjs
│   └── ./.eslintrc.cjs — eslint 9 flat config или legacy
├── 1.10 .prettierrc
│   └── ./.prettierrc — printWidth 100, singleQuote true
├── 1.11 ecosystem.config.cjs (PM2)
│   └── ./ecosystem.config.cjs — 3 процесса
├── 1.12 README.md
│   └── ./README.md — quickstart, ссылки на доки
└── 1.13 scripts/bootstrap-user.ts
    └── ./scripts/bootstrap-user.ts — idempotent INSERT user
```

### Files to create

| # | File | Lines (approx) | Status |
|---|---|---|---|
| 1 | `package.json` | 40 | done |
| 2 | `pnpm-workspace.yaml` | 4 | done |
| 3 | `turbo.json` | 25 | done |
| 4 | `tsconfig.base.json` | 60 | done |
| 5 | `tsconfig.json` | 15 | done |
| 6 | `.env.example` | 70 | done |
| 7 | `.env` | 70 | done (chmod 600) |
| 8 | `.gitignore` | 30 | done |
| 9 | `.eslintrc.cjs` | 30 | done |
| 10 | `.prettierrc` | 10 | done |
| 11 | `ecosystem.config.cjs` | 60 | TODO |
| 12 | `README.md` | 50 | done |
| 13 | `scripts/bootstrap-user.ts` | 60 | TODO |

---

## PBS 2.0 packages/types

```
2.0 packages/types
├── 2.1 package.json
│   └── packages/types/package.json — name @legal-ai-assistant/types, type module
├── 2.2 tsconfig.json
│   └── extends ../../tsconfig.base.json, composite=true, outDir dist
├── 2.3 src/case-type.ts
│   ├── enum CaseType (OSAGO, DTP, LABOR, FAMILY, INHERITANCE, ADMIN, CRIMINAL, PROCUREMENT, GENERAL)
│   └── interface CaseTypeDefinition (key, name_ru, description, system_prompt, document_checklist, applicable_npa, default_tools)
├── 2.4 src/folder.ts
│   └── interface Folder (id ULID, userId, name, caseType, systemPrompt, effort, archived, createdAt, updatedAt)
├── 2.5 src/file.ts
│   ├── type OcrStatus = 'pending'|'processing'|'done'|'failed'|'skipped'
│   └── interface FileEntity (id, folderId, filename, storagePath, mime, sizeBytes, sha256, ocrStatus, ocrText, ocrError, dates)
├── 2.6 src/message.ts
│   ├── type MessageRole = 'user'|'assistant'|'system'|'tool'
│   ├── interface ToolCallLog (name, input, output, outputTruncated, latencyMs, error?)
│   └── interface Message (id, folderId, turnId uuid, role, content, toolCalls, tokensIn, tokensOut, archived, createdAt)
├── 2.7 src/chat.ts
│   ├── enum Effort (low, medium, high, max)
│   ├── interface Citation (index, url, title?, verified, toolCallId?)
│   └── interface StreamChunk (discriminated union: text-delta, tool-use, tool-result, thinking-delta, end)
├── 2.8 src/result.ts
│   └── type Result<T, E = Error> = { ok: true, value: T } | { ok: false, error: E }
└── 2.9 src/index.ts
    └── re-export: case-type, folder, file, message, chat, result
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/types/package.json` | 15 |
| 2 | `packages/types/tsconfig.json` | 12 |
| 3 | `packages/types/src/case-type.ts` | 40 |
| 4 | `packages/types/src/folder.ts` | 30 |
| 5 | `packages/types/src/file.ts` | 35 |
| 6 | `packages/types/src/message.ts` | 50 |
| 7 | `packages/types/src/chat.ts` | 50 |
| 8 | `packages/types/src/result.ts` | 15 |
| 9 | `packages/types/src/index.ts` | 10 |

---

## PBS 3.0 packages/db

```
3.0 packages/db
├── 3.1 package.json
│   └── deps: drizzle-orm, postgres (или pg + drizzle-orm/postgres-js), pgvector, ulid
├── 3.2 tsconfig.json (composite, references types)
├── 3.3 drizzle.config.ts
│   └── packages/db/drizzle.config.ts — schema=./src/schema, out=./migrations
├── 3.4 src/client.ts
│   └── singleton Postgres client (postgres.js), pool max=10
├── 3.5 src/schema/users.ts
│   └── pgTable users (id char26 PK, email unique, password_hash, display_name, dates)
├── 3.6 src/schema/folders.ts
│   ├── pgEnum case_type
│   ├── pgEnum effort
│   └── pgTable folders (id, user_id FK, name, case_type, system_prompt, effort, archived, dates)
├── 3.7 src/schema/files.ts
│   ├── pgEnum ocr_status
│   └── pgTable files (id, folder_id FK, filename, storage_path, mime, size_bytes, sha256, ocr_status, ocr_text, ocr_error, dates) + UNIQUE(folder_id, sha256)
├── 3.8 src/schema/messages.ts
│   ├── pgEnum message_role
│   └── pgTable messages (id, folder_id FK, turn_id uuid, role, content, tool_calls jsonb, tokens_in, tokens_out, archived, created_at)
├── 3.9 src/schema/embeddings.ts
│   └── pgTable embeddings (id, file_id FK, folder_id FK, chunk_index, content, embedding vector(1024), metadata jsonb, created_at) + HNSW index
├── 3.10 src/schema/sessions.ts
│   └── pgTable sessions (id, user_id FK, expires_at, user_agent, ip inet, created_at, revoked_at)
├── 3.11 src/schema/audit.ts
│   ├── pgTable audit_log (bigserial id, turn_id, folder_id, user_id, action, model, effort, токены, cost, latency, tool_calls, payload, request_id, ip, created_at)
│   └── pgTable tool_call_log (bigserial id, turn_id, folder_id, name, input, output, output_truncated, latency_ms, error, created_at)
├── 3.12 src/schema/cache.ts
│   ├── pgTable npa_search_cache (query_hash PK, doc_type, date_from, results, fetched_at)
│   ├── pgTable npa_doc_cache (url_hash PK, title, full_text_md, structure, fetched_at)
│   └── pgTable court_search_cache (query_hash PK, results, fetched_at)
├── 3.13 src/schema/quota.ts
│   └── pgTable claude_quota (id serial PK, observed_at, reset_at, requests_left, tokens_left, scope)
├── 3.14 src/schema/index.ts
│   └── re-export всех таблиц + enums
├── 3.15 src/queries/folders.ts
│   ├── createFolder(userId, dto)
│   ├── listFolders(userId, includeArchived=false)
│   ├── getFolder(id, userId)
│   ├── updateFolder(id, userId, dto)
│   └── archiveFolder(id, userId)
├── 3.16 src/queries/files.ts
│   ├── insertFile(folderId, dto)
│   ├── getFile(id, userId)
│   ├── listFilesByFolder(folderId)
│   ├── updateFileOcr(id, status, text?, error?)
│   └── findFileByHash(folderId, sha256)
├── 3.17 src/queries/messages.ts
│   ├── insertMessage(dto)
│   ├── listMessages(folderId, archived=false, limit=30)
│   └── archiveAllMessages(folderId)
├── 3.18 src/queries/embeddings.ts
│   ├── insertEmbeddings(rows)
│   ├── searchInFolder(folderId, embedding, limit=8)
│   └── searchAcrossFolders(folderIds, embedding, limit=8)
├── 3.19 src/queries/audit.ts
│   ├── logTurn(turn) → INSERT audit_log
│   └── logToolCall(call) → INSERT tool_call_log
├── 3.20 src/queries/cache.ts
│   ├── getCached(table, hash, maxAgeMs)
│   └── setCached(table, hash, payload)
├── 3.21 src/ulid.ts
│   ├── newUlid(): string (26 char Crockford32)
│   └── isUlid(s): boolean (regex)
├── 3.22 src/index.ts
│   └── barrel: client + schema + queries
└── 3.23 migrations/0001_init.sql
    └── полная DDL (см. DESIGN_DOC §6) сгенерированная drizzle-kit
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/db/package.json` | 25 |
| 2 | `packages/db/tsconfig.json` | 15 |
| 3 | `packages/db/drizzle.config.ts` | 20 |
| 4 | `packages/db/src/client.ts` | 30 |
| 5 | `packages/db/src/schema/users.ts` | 25 |
| 6 | `packages/db/src/schema/folders.ts` | 50 |
| 7 | `packages/db/src/schema/files.ts` | 50 |
| 8 | `packages/db/src/schema/messages.ts` | 40 |
| 9 | `packages/db/src/schema/embeddings.ts` | 50 |
| 10 | `packages/db/src/schema/sessions.ts` | 25 |
| 11 | `packages/db/src/schema/audit.ts` | 80 |
| 12 | `packages/db/src/schema/cache.ts` | 45 |
| 13 | `packages/db/src/schema/quota.ts` | 20 |
| 14 | `packages/db/src/schema/index.ts` | 20 |
| 15 | `packages/db/src/queries/folders.ts` | 80 |
| 16 | `packages/db/src/queries/files.ts` | 80 |
| 17 | `packages/db/src/queries/messages.ts` | 60 |
| 18 | `packages/db/src/queries/embeddings.ts` | 70 |
| 19 | `packages/db/src/queries/audit.ts` | 50 |
| 20 | `packages/db/src/queries/cache.ts` | 40 |
| 21 | `packages/db/src/ulid.ts` | 30 |
| 22 | `packages/db/src/index.ts` | 15 |
| 23 | `packages/db/migrations/0001_init.sql` | 220 |

---

## PBS 4.0 packages/sandbox

```
4.0 packages/sandbox
├── 4.1 package.json
│   └── deps: file-type
├── 4.2 src/paths.ts
│   ├── resolveSandboxPath(opts: { rootDir, folderId, filename }): string
│   ├── валидация ULID (regex), NUL-byte guard, path-separator guard
│   └── lstat-symlink проверка по компонентам (preWriteCheck)
├── 4.3 src/magic.ts
│   ├── detectMime(buffer: Buffer): Promise<string>
│   └── через file-type npm
├── 4.4 src/validate.ts
│   ├── ALLOWED_MIMES = Set<string> (pdf, docx, doc, jpg, png, webp, txt, audio/{webm,wav,mpeg})
│   ├── canonicalExtFromMime(mime): string
│   ├── validateMime(buffer, declaredMime): Promise<{ ok, canonical, ext }>
│   └── validateFilename(name): { ok, reason? } (длина <=255, NFKC, NUL, /, \, ..)
├── 4.5 src/store.ts
│   ├── writeFileExclusive(fullPath, buffer, mode=0o640): Promise<void>
│   │   └── fs.open(full, 'wx', 0o640) — exclusive create (TOCTOU защита)
│   ├── computeSha256(buffer): string
│   └── readFileSandboxed(fullPath): Promise<Buffer>
├── 4.6 src/errors.ts
│   ├── class SandboxError extends Error (code: 'INVALID_PATH'|'SYMLINK'|'TOCTOU'|...)
│   └── class MimeRejected extends Error
├── 4.7 src/index.ts
│   └── barrel: paths, magic, validate, store, errors
├── 4.8 tests/paths.test.ts
│   └── edge-cases: '..', '\\..', '/etc/passwd', '\x00', NFKC, длина >255, симлинки
├── 4.9 tests/magic.test.ts
│   └── PDF magic, PNG magic, неверный header
└── 4.10 tests/validate.test.ts
    └── allowed MIMEs, canonical ext, filename rejection cases
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/sandbox/package.json` | 20 |
| 2 | `packages/sandbox/tsconfig.json` | 12 |
| 3 | `packages/sandbox/src/paths.ts` | 80 |
| 4 | `packages/sandbox/src/magic.ts` | 30 |
| 5 | `packages/sandbox/src/validate.ts` | 70 |
| 6 | `packages/sandbox/src/store.ts` | 60 |
| 7 | `packages/sandbox/src/errors.ts` | 30 |
| 8 | `packages/sandbox/src/index.ts` | 10 |
| 9 | `packages/sandbox/tests/paths.test.ts` | 120 |
| 10 | `packages/sandbox/tests/magic.test.ts` | 50 |
| 11 | `packages/sandbox/tests/validate.test.ts` | 80 |

---

## PBS 5.0 packages/claude-client

```
5.0 packages/claude-client
├── 5.1 package.json
│   └── deps: @anthropic-ai/sdk, undici, socks-proxy-agent
├── 5.2 src/types.ts
│   ├── enum ClaudeTransport ('api'|'api+proxy'|'relay')
│   ├── interface StreamMessageOpts (model, system, messages, tools?, effort?, maxTokens?, signal?)
│   ├── interface StreamChunk (discriminated union: text-delta, tool-use, tool-result, thinking-delta, end, error)
│   ├── interface ToolDef (name, description, input_schema)
│   └── interface ToolCtx (folderId, userId, turnId, mentionedFolders, db, http, logger)
├── 5.3 src/index.ts
│   ├── createClaudeClient(env): ClaudeClient
│   └── ClaudeClient.streamMessage(opts): AsyncIterable<StreamChunk>
├── 5.4 src/direct-transport.ts
│   ├── streamViaApi(opts, env): AsyncIterable<StreamChunk>
│   └── @anthropic-ai/sdk + native fetch
├── 5.5 src/proxy-transport.ts
│   ├── streamViaApiProxy(opts, env): AsyncIterable<StreamChunk>
│   └── undici Agent + SocksProxyAgent('socks5h://<PROXY_HOST>:1080')
├── 5.6 src/relay-transport.ts
│   └── streamViaRelay() → throws Error('OAuth relay not implemented in MVP')
├── 5.7 src/stream.ts
│   ├── normalizeStream(rawSse): AsyncIterable<StreamChunk>
│   └── parser SSE-events Anthropic → unified StreamChunk
├── 5.8 src/retry.ts
│   ├── retry(fn, { attempts: 3, base: 500, max: 8000 }): Promise<T>
│   └── circuit-breaker состояние per-transport
├── 5.9 src/tool-runtime.ts
│   ├── runToolLoop(stream, ctx, registry): AsyncIterable<StreamChunk>
│   ├── max 8 итераций, max 5 повторов одной тулзы, max 20 общих
│   ├── inject ctx, zod-validate, execute, log в tool_call_log
│   └── inject tool_result block обратно в conversation
├── 5.10 src/effort.ts
│   ├── effortToModel(effort): { model, thinkingTokens, useTools }
│   └── low → haiku-4-5 (no thinking, no tools)
│       medium → sonnet-4-6 (thinking 8k, tools)
│       high → sonnet-4-6 (thinking 16k, tools)
│       max → opus-4-7 (thinking 32k, tools) — default
├── 5.11 src/pricing.ts
│   ├── PRICING: Record<model, { inputUsdPer1M, cachedInputUsdPer1M, outputUsdPer1M }>
│   └── estimateCostUsd(model, tokens): number
├── 5.12 src/quota.ts
│   ├── parseRateLimitHeaders(headers): QuotaSnapshot
│   └── записывает в db.claude_quota
├── 5.13 src/redact.ts
│   └── redactSecrets(text): text — regex sk-ant-* → sk-ant-***
└── 5.14 src/system-blocks.ts
    ├── BASE_GUIDELINES (const string, чисто строка)
    └── buildSystemBlocks({ baseGuidelines, caseTypePrompt, folderHeader, mentionedFiles }): Array<SystemBlock>
        с cache_control: ephemeral на caseType + mentioned files
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/claude-client/package.json` | 25 |
| 2 | `packages/claude-client/tsconfig.json` | 15 |
| 3 | `packages/claude-client/src/types.ts` | 90 |
| 4 | `packages/claude-client/src/index.ts` | 60 |
| 5 | `packages/claude-client/src/direct-transport.ts` | 90 |
| 6 | `packages/claude-client/src/proxy-transport.ts` | 80 |
| 7 | `packages/claude-client/src/relay-transport.ts` | 20 |
| 8 | `packages/claude-client/src/stream.ts` | 110 |
| 9 | `packages/claude-client/src/retry.ts` | 60 |
| 10 | `packages/claude-client/src/tool-runtime.ts` | 180 |
| 11 | `packages/claude-client/src/effort.ts` | 50 |
| 12 | `packages/claude-client/src/pricing.ts` | 40 |
| 13 | `packages/claude-client/src/quota.ts` | 50 |
| 14 | `packages/claude-client/src/redact.ts` | 25 |
| 15 | `packages/claude-client/src/system-blocks.ts` | 100 |

---

## PBS 6.0 packages/claude-tools

```
6.0 packages/claude-tools
├── 6.1 package.json
│   └── deps: cheerio, turndown, undici, zod, lru-cache
├── 6.2 src/types.ts
│   └── interface Tool<I, O> { name, description, inputSchema (zod), execute(input, ctx): Promise<O> }
├── 6.3 src/index.ts
│   └── registry = { search_npa, fetch_npa_document, ... } as Record<string, Tool>
├── 6.4 src/helpers/cache.ts
│   ├── lruInProcess<T>(name, max=200, ttlMs)
│   └── pgCacheGet(table, hash, ttl) / pgCacheSet
├── 6.5 src/helpers/http.ts
│   ├── fetchWithTimeout(url, opts, capBytes, timeoutMs): Response
│   ├── safeText(res, capBytes): Promise<string>
│   └── User-Agent header policy (фиксированный UA для tool requests)
├── 6.6 src/helpers/ssrf.ts
│   ├── BLOCKED_CIDRS = ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','127.0.0.0/8','169.254.0.0/16','::1/128','fc00::/7','fe80::/10', multicast]
│   ├── isPrivateIp(ip): boolean
│   ├── resolveAndCheck(host): Promise<string[]>
│   └── connectByIp(ip, host, path, opts): Promise<Response> (Host-override, anti-rebinding)
├── 6.7 src/search-npa.ts
│   ├── inputSchema: { query, doc_type? ('закон'|'постановление'|'указ'|...), date_from? }
│   ├── outputSchema: { results: Array<{ title, doc_id, date, url }> }
│   └── execute: pravo.gov.ru JSON → HTML scrape fallback → web_search('site:pravo.gov.ru ...') fallback. cache 24h.
├── 6.8 src/fetch-npa-document.ts
│   ├── inputSchema: { url }
│   ├── outputSchema: { title, full_text_md, structure: Array<{ article_no, title }> }
│   └── execute: GET → cheerio + turndown + extract structure (`Статья N. Название`). cache 7d, size cap 60 KB output.
├── 6.9 src/search-court-practice.ts
│   ├── inputSchema: { query, court_level? ('РС'|'СПЭ'|'ВС'|'арбитр'), date_from? }
│   ├── outputSchema: { results: Array<{ title, court, date, url, snippet }> }
│   └── execute: sudact.ru всегда → kad.arbitr.ru через Playwright sidecar (best-effort, circuit breaker). cache 6h.
├── 6.10 src/web-search.ts
│   ├── inputSchema: { query, num_results=8 }
│   ├── outputSchema: { results: Array<{ title, url, snippet }> }
│   └── execute: SearXNG http://127.0.0.1:8888/search?format=json. cache 1h LRU.
├── 6.11 src/fetch-web-page.ts
│   ├── inputSchema: { url }
│   ├── outputSchema: { title?, content_md, status, mime }
│   └── execute: SSRF guard → connect-by-IP → cap 5MB/15s/3rdr → cheerio + turndown.
├── 6.12 src/read-file-in-folder.ts
│   ├── inputSchema: { filename } (folder_id из ctx)
│   ├── outputSchema: { filename, mime, ocr_text, size_bytes, ocr_status }
│   └── execute: SELECT files WHERE folder_id=ctx.folderId AND filename=$1.
├── 6.13 src/list-folder-contents.ts
│   ├── inputSchema: {} (folder_id из ctx)
│   ├── outputSchema: { folder: { id, name, case_type }, files: Array<{ filename, mime, size_bytes, ocr_status }> }
│   └── execute: SELECT folders + files WHERE folder_id=ctx.folderId.
├── 6.14 src/semantic-search-in-folder.ts
│   ├── inputSchema: { query, top_k=8 }
│   ├── outputSchema: { hits: Array<{ filename, chunk: string, score: number }> }
│   └── execute: e5-large('query: ' + query) → pgvector cosine top-8 WHERE folder_id=ctx.folderId.
└── 6.15 src/cross-folder-search.ts
    ├── inputSchema: { folder_name, query, top_k=8 }
    ├── outputSchema: { hits: Array<{ filename, chunk, score, folder: string }> }
    └── execute: ENFORCE ctx.mentionedFolders.includes(input.folder_name) → SELECT folder by name WHERE user_id=ctx.userId → search в его embeddings. иначе ToolGuardError.
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/claude-tools/package.json` | 25 |
| 2 | `packages/claude-tools/tsconfig.json` | 15 |
| 3 | `packages/claude-tools/src/types.ts` | 50 |
| 4 | `packages/claude-tools/src/index.ts` | 30 |
| 5 | `packages/claude-tools/src/helpers/cache.ts` | 60 |
| 6 | `packages/claude-tools/src/helpers/http.ts` | 70 |
| 7 | `packages/claude-tools/src/helpers/ssrf.ts` | 130 |
| 8 | `packages/claude-tools/src/search-npa.ts` | 180 |
| 9 | `packages/claude-tools/src/fetch-npa-document.ts` | 130 |
| 10 | `packages/claude-tools/src/search-court-practice.ts` | 170 |
| 11 | `packages/claude-tools/src/web-search.ts` | 70 |
| 12 | `packages/claude-tools/src/fetch-web-page.ts` | 110 |
| 13 | `packages/claude-tools/src/read-file-in-folder.ts` | 50 |
| 14 | `packages/claude-tools/src/list-folder-contents.ts` | 50 |
| 15 | `packages/claude-tools/src/semantic-search-in-folder.ts` | 60 |
| 16 | `packages/claude-tools/src/cross-folder-search.ts` | 80 |

---

## PBS 7.0 packages/embeddings

```
7.0 packages/embeddings
├── 7.1 package.json
│   └── deps: @huggingface/transformers, gpt-tokenizer (или cl100k_base)
├── 7.2 src/types.ts
│   ├── interface EmbeddingProvider { embedBatch(texts, mode: 'passage'|'query'): Promise<number[][]> }
│   └── interface ChunkSpec { content, tokens, headerPath: string[] }
├── 7.3 src/index.ts
│   └── createEmbeddingProvider(env): EmbeddingProvider (выбор по EMBEDDING_PROVIDER)
├── 7.4 src/e5-local.ts
│   ├── lazy-load Xenova/multilingual-e5-large (singleton, load on first call)
│   ├── embedBatch(texts, mode): добавляет префикс 'passage: ' / 'query: '
│   └── batch=16, mean pooling, normalize L2
├── 7.5 src/openai.ts
│   └── OpenAI text-embedding-3-large (3072 dim) — на slot, fallback если e5 не справится
├── 7.6 src/chunker.ts
│   ├── chunkText(text, opts={ targetTokens: 800, overlap: 100 }): ChunkSpec[]
│   ├── recursive split по ['\n# ','\n## ','\n\n','\nСтатья ','\n\\d+\\. ','\n','. ']
│   └── tokenizer = gpt-tokenizer (cl100k_base, approx)
├── 7.7 src/upsert.ts
│   ├── embedAndUpsert(fileId, folderId, text, db, provider, logger)
│   ├── chunkText → embedBatch passage → INSERT embeddings rows
│   └── batched insert (100 at a time)
└── 7.8 src/index.ts (barrel)
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/embeddings/package.json` | 22 |
| 2 | `packages/embeddings/tsconfig.json` | 15 |
| 3 | `packages/embeddings/src/types.ts` | 30 |
| 4 | `packages/embeddings/src/index.ts` | 30 |
| 5 | `packages/embeddings/src/e5-local.ts` | 100 |
| 6 | `packages/embeddings/src/openai.ts` | 60 |
| 7 | `packages/embeddings/src/chunker.ts` | 120 |
| 8 | `packages/embeddings/src/upsert.ts` | 70 |

---

## PBS 8.0 packages/{ocr, stt, docx-export, ui}

### 8.1 packages/ocr

```
8.1 packages/ocr
├── package.json (deps: execa, mammoth)
├── src/types.ts
│   └── interface OcrJob { fileId, mime, storagePath } / OcrResult { text, error? }
├── src/pdf.ts
│   ├── extractPdfText(path): Promise<string> (pdftotext -layout)
│   ├── rasterizePdf(path, dpi=200): Promise<string[]> (pdftoppm pages)
│   └── tesseractRus(imagePath): Promise<string>
├── src/image.ts
│   └── tesseractRusEng(path): execa('tesseract', [path, 'stdout', '-l', 'rus+eng', '--psm', '1'])
├── src/docx.ts
│   └── extractDocxText(path): mammoth.extractRawText
├── src/orchestrator.ts
│   └── runOcr(job): mime-роутер → pdf | image | docx | txt | skip
└── src/index.ts (barrel)
```

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/ocr/package.json` | 22 |
| 2 | `packages/ocr/tsconfig.json` | 15 |
| 3 | `packages/ocr/src/types.ts` | 25 |
| 4 | `packages/ocr/src/pdf.ts` | 90 |
| 5 | `packages/ocr/src/image.ts` | 30 |
| 6 | `packages/ocr/src/docx.ts` | 25 |
| 7 | `packages/ocr/src/orchestrator.ts` | 80 |
| 8 | `packages/ocr/src/index.ts` | 10 |

### 8.2 packages/stt

```
8.2 packages/stt
├── package.json (deps: openai, execa)
├── src/types.ts
│   └── interface SttResult { text, durationSec, provider, languageDetected? }
├── src/openai-api.ts
│   └── transcribeWithOpenAI(wavPath, env): Promise<SttResult>
├── src/whisper-cpp.ts
│   └── transcribeWithWhisperCpp(wavPath, env): Promise<SttResult> (fallback)
├── src/transcode.ts
│   └── webmToWav16k(buffer): Promise<Buffer> (ffmpeg pipe)
├── src/index.ts
│   └── createStt(env) → either openai-api or whisper-cpp by env
```

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/stt/package.json` | 22 |
| 2 | `packages/stt/tsconfig.json` | 15 |
| 3 | `packages/stt/src/types.ts` | 20 |
| 4 | `packages/stt/src/openai-api.ts` | 60 |
| 5 | `packages/stt/src/whisper-cpp.ts` | 50 |
| 6 | `packages/stt/src/transcode.ts` | 50 |
| 7 | `packages/stt/src/index.ts` | 30 |

### 8.3 packages/docx-export

```
8.3 packages/docx-export
├── package.json (deps: docx, mdast-util-from-markdown, mdast-util-gfm)
├── src/types.ts
│   └── interface DocxRenderOpts { title, author, footer? }
├── src/markdown.ts
│   └── parseMarkdown(md): mdast Root
├── src/render.ts
│   ├── renderToDocx(mdast, opts): Promise<Buffer>
│   ├── маппинг: heading → Paragraph(heading_N), paragraph → Paragraph,
│   │            list → numbered/bulleted, table → Table, blockquote → indented Paragraph,
│   │            code → mono Paragraph, footnote → FootnoteReferenceRun
│   └── A4, поля 25/20/20/15мм, Times New Roman 12, headings 14/13
├── src/styles.ts
│   └── BASE_STYLES = { default font, size, line spacing, page margins }
└── src/index.ts (barrel)
```

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/docx-export/package.json` | 22 |
| 2 | `packages/docx-export/tsconfig.json` | 15 |
| 3 | `packages/docx-export/src/types.ts` | 20 |
| 4 | `packages/docx-export/src/markdown.ts` | 30 |
| 5 | `packages/docx-export/src/render.ts` | 250 |
| 6 | `packages/docx-export/src/styles.ts` | 80 |
| 7 | `packages/docx-export/src/index.ts` | 10 |

### 8.4 packages/ui

```
8.4 packages/ui
├── package.json (deps: react 19, @radix-ui/*, tailwindcss, class-variance-authority, clsx)
├── src/components/button.tsx (shadcn, variants)
├── src/components/dialog.tsx
├── src/components/dropdown-menu.tsx
├── src/components/tabs.tsx
├── src/components/textarea.tsx
├── src/components/tooltip.tsx
├── src/components/badge.tsx
├── src/components/progress.tsx
├── src/components/scroll-area.tsx
├── src/components/separator.tsx
├── src/components/popover.tsx
├── src/components/skeleton.tsx
├── src/components/toast.tsx
├── src/components/spinner.tsx
├── src/cn.ts (clsx + tailwind-merge)
└── src/index.ts (barrel)
```

| # | File | Lines (approx) |
|---|---|---|
| 1 | `packages/ui/package.json` | 25 |
| 2 | `packages/ui/tsconfig.json` | 15 |
| 3 | `packages/ui/src/components/button.tsx` | 60 |
| 4 | `packages/ui/src/components/dialog.tsx` | 80 |
| 5 | `packages/ui/src/components/dropdown-menu.tsx` | 90 |
| 6 | `packages/ui/src/components/tabs.tsx` | 60 |
| 7 | `packages/ui/src/components/textarea.tsx` | 35 |
| 8 | `packages/ui/src/components/tooltip.tsx` | 50 |
| 9 | `packages/ui/src/components/badge.tsx` | 40 |
| 10 | `packages/ui/src/components/progress.tsx` | 45 |
| 11 | `packages/ui/src/components/scroll-area.tsx` | 55 |
| 12 | `packages/ui/src/components/separator.tsx` | 25 |
| 13 | `packages/ui/src/components/popover.tsx` | 60 |
| 14 | `packages/ui/src/components/skeleton.tsx` | 25 |
| 15 | `packages/ui/src/components/toast.tsx` | 80 |
| 16 | `packages/ui/src/components/spinner.tsx` | 30 |
| 17 | `packages/ui/src/cn.ts` | 10 |
| 18 | `packages/ui/src/index.ts` | 20 |

---

## PBS 9.0 apps/web — auth + middleware

```
9.0 apps/web auth + middleware
├── 9.1 src/middleware.ts
│   ├── matcher: всё кроме /login, /api/auth/*, /api/health, /api/ready, /_next/*, статики
│   ├── requireSession()
│   ├── CSRF check на POST/PATCH/DELETE
│   └── inject x-request-id (uuidv7)
├── 9.2 src/lib/env.ts
│   ├── загружает + zod-валидирует .env
│   └── exports env: typed object
├── 9.3 src/lib/logger.ts
│   ├── pino instance с redact policy
│   └── reqLogger(req) child с x-request-id
├── 9.4 src/lib/auth/session.ts
│   ├── ironSessionOptions = { cookieName: 'legal-ai-assistant_session', password, cookieOptions: secure, httpOnly, sameSite='strict', maxAge=14d }
│   ├── getSession(req): Promise<Session>
│   ├── requireSession(req): Promise<Session> (302 to /login if missing)
│   └── verifyOwner(folderId, userId): Promise<void>
├── 9.5 src/lib/auth/password.ts
│   ├── hashPassword(plain): Promise<string> (bcrypt 12)
│   └── verifyPassword(plain, hash): Promise<boolean>
├── 9.6 src/lib/auth/csrf.ts
│   ├── generateCsrfToken(secret): string
│   ├── verifyCsrf(req): boolean (cookie + header double-submit)
│   └── injectCsrfHeader(res)
├── 9.7 src/lib/auth/middleware.ts
│   └── helpers для requireSession/CSRF, переиспользуемые из middleware.ts и API routes
├── 9.8 src/instrumentation.ts (Next.js hook)
│   ├── boot pino logger
│   ├── boot pg-boss singleton (только в worker процессах через ENV-флаг)
│   └── memory monitor (process.memoryUsage every 60s)
├── 9.9 src/lib/audit.ts
│   ├── audit(action, payload, req): INSERT audit_log
│   └── auditTurn(turn, ...) helper
├── 9.10 src/app/(auth)/login/page.tsx (server component)
│   └── форма email + password + CSRF hidden + submit
├── 9.11 src/app/(auth)/login/action.ts (Server Action)
│   ├── zod validate
│   ├── verifyPassword
│   ├── ironSession.save({ userId, email, csrfSecret })
│   └── redirect к last folder или /folders/new
└── 9.12 src/app/api/auth/{login,logout,csrf}/route.ts
    ├── login/route.ts — POST email+password+csrf → set-cookie session
    ├── logout/route.ts — POST → ironSession.destroy + Set-Cookie expired
    └── csrf/route.ts — GET → JSON { token } для ajax flows
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `apps/web/src/middleware.ts` | 80 |
| 2 | `apps/web/src/lib/env.ts` | 100 |
| 3 | `apps/web/src/lib/logger.ts` | 50 |
| 4 | `apps/web/src/lib/auth/session.ts` | 90 |
| 5 | `apps/web/src/lib/auth/password.ts` | 30 |
| 6 | `apps/web/src/lib/auth/csrf.ts` | 60 |
| 7 | `apps/web/src/lib/auth/middleware.ts` | 50 |
| 8 | `apps/web/src/instrumentation.ts` | 60 |
| 9 | `apps/web/src/lib/audit.ts` | 60 |
| 10 | `apps/web/src/app/(auth)/login/page.tsx` | 80 |
| 11 | `apps/web/src/app/(auth)/login/action.ts` | 60 |
| 12 | `apps/web/src/app/api/auth/login/route.ts` | 50 |
| 13 | `apps/web/src/app/api/auth/logout/route.ts` | 25 |
| 14 | `apps/web/src/app/api/auth/csrf/route.ts` | 25 |

---

## PBS 10.0 apps/web — App Router pages + API routes

```
10.0 apps/web App Router
├── 10.1 next.config.mjs
│   ├── output: 'standalone'
│   ├── experimental.serverActions
│   └── port 3010
├── 10.2 tailwind.config.ts
│   └── content: app/**/*.{ts,tsx}, components/**, paths из @legal-ai-assistant/ui
├── 10.3 postcss.config.mjs
│   └── tailwindcss + autoprefixer
├── 10.4 drizzle.config.ts (apps/web)
│   └── reuse packages/db config
├── 10.5 public/manifest.webmanifest
│   └── PWA manifest
├── 10.6 public/sw.js
│   └── простой service worker (skipWaiting + claim, без cache в MVP)
├── 10.7 public/icons/{192,512,maskable}.png
├── 10.8 src/app/layout.tsx
│   ├── корневой layout (HTML + body, шрифты, theme provider, toast container)
│   └── viewport, robots noindex
├── 10.9 src/app/(app)/layout.tsx
│   ├── 3-pane shell wrapper (см. PBS 11.1)
│   └── получает folders list (RSC server fetch)
├── 10.10 src/app/(app)/folders/[id]/page.tsx
│   ├── SSR: SELECT folder + messages (last 30) + files
│   └── рендерит ChatPane + DocumentPreview
├── 10.11 src/app/(app)/folders/new/page.tsx
│   └── форма: name + caseType select → create + redirect
├── 10.12 src/app/(app)/settings/page.tsx
│   ├── смена пароля
│   ├── список case-types (link на edit)
│   └── ссылки на /settings/audit
├── 10.13 src/app/(app)/settings/case-types/[slug]/page.tsx
│   └── YAML editor для одного из 9 типов дел
├── 10.14 src/app/(app)/settings/audit/page.tsx
│   └── табличка последних 100 turns с tokens/cost/latency
├── 10.15 src/app/api/folders/route.ts
│   ├── GET — list, POST — create
├── 10.16 src/app/api/folders/[id]/route.ts
│   ├── GET — get one
│   ├── PATCH — update
│   └── DELETE — archive (не hard delete)
├── 10.17 src/app/api/files/upload/route.ts
│   ├── POST multipart, max 50 MB, max 10 files
│   ├── magic-byte check
│   ├── sandbox path
│   ├── sha256
│   ├── INSERT files
│   └── pg-boss enqueue 'ocr.run'
├── 10.18 src/app/api/files/[id]/raw/route.ts
│   ├── GET — Content-Type из mime, X-Content-Type-Options nosniff
│   └── verifyOwner (folder.user_id)
├── 10.19 src/app/api/files/[id]/ocr/route.ts
│   └── POST — re-enqueue 'ocr.run' (retry button)
├── 10.20 src/app/api/chat/stream/route.ts
│   ├── zod-validate body { folderId, messages, attachedFileIds?, effort? }
│   ├── requireSession + verifyOwner
│   ├── INSERT user message
│   ├── buildRequest → claudeClient.streamMessage
│   ├── proxy SSE → клиент
│   └── on end: INSERT assistant message + audit_log + citation verifier
├── 10.21 src/app/api/chat/clear/route.ts
│   ├── POST { folderId }
│   └── UPDATE messages SET archived=true WHERE folder_id=$1
├── 10.22 src/app/api/chat/compact/route.ts
│   ├── POST { folderId }
│   ├── вызов claude-client с Haiku + effort=low
│   ├── INSERT system message с summary
│   └── UPDATE archived=true остальных
├── 10.23 src/app/api/stt/route.ts
│   ├── POST blob (audio/webm)
│   ├── ffmpeg → 16kHz WAV
│   └── stt.transcribe → JSON { text }
├── 10.24 src/app/api/export/docx/route.ts
│   ├── POST { messageId }
│   ├── SELECT message
│   ├── parseMarkdown → renderToDocx
│   └── attachment with filename "{folder}-{ts}.docx"
├── 10.25 src/app/api/health/route.ts
│   └── GET — { status: 'ok' } (200)
├── 10.26 src/app/api/ready/route.ts
│   └── GET — DB ping + freeMb check (>1500), 200 / 503
├── 10.27 src/server/chat/build-request.ts
│   ├── async buildRequest(req, ctx, db, env): { systemBlocks, messages, tools, model, ... }
│   ├── load folder + caseType YAML (LRU + mtime invalidate)
│   ├── BASE_GUIDELINES + caseType.system_prompt (cache_control) + folder header
│   ├── history sliding 30, dynamic compaction если >60k токенов
│   ├── parseMentions @<name> → mentionedFolders, @file:<name> → inline <document>
│   ├── tools = caseType.default_tools ∪ [read_file_in_folder, list_folder_contents, semantic_search_in_folder]
│   └── effort → model + thinking + tools
├── 10.28 src/server/chat/clear-handler.ts
│   └── archive all messages, optional INSERT system breaker
├── 10.29 src/server/chat/compact-handler.ts
│   └── Haiku summary call → INSERT system msg + archive old
├── 10.30 src/server/chat/citation-verifier.ts
│   ├── extractCitations(answer): Citation[]
│   ├── verifyAgainstToolLog(citations, turnId, db): annotated[]
│   └── secondPass(unverified, ctx): Promise<rewrittenAnswer>
├── 10.31 src/server/actions/folders.ts
│   ├── createFolderAction(formData)
│   ├── renameFolderAction
│   └── archiveFolderAction
├── 10.32 src/server/actions/files.ts
│   ├── deleteFileAction(id) — soft delete (archived flag in future) + remove from disk
├── 10.33 src/server/actions/messages.ts
│   └── helpers для server-rendered страниц
├── 10.34 src/lib/case-types/loader.ts
│   ├── async loadCaseType(slug): CaseTypeDefinition (LRU + mtime invalidation)
│   └── path apps/web/config/case-types/<slug>.yaml
├── 10.35 src/lib/case-types/validator.ts
│   └── zod-схема CaseTypeDefinition + validate(yaml)
├── 10.36 src/lib/markdown/render.tsx
│   ├── React component MarkdownRenderer (react-markdown + remark-gfm)
│   └── footnote citations [1], [2] кликабельные
├── 10.37 config/case-types/osago.yaml (см. DESIGN_DOC §13)
├── 10.38 config/case-types/dtp.yaml
├── 10.39 config/case-types/labor.yaml
├── 10.40 config/case-types/family.yaml
├── 10.41 config/case-types/inheritance.yaml
├── 10.42 config/case-types/admin.yaml
├── 10.43 config/case-types/criminal.yaml
├── 10.44 config/case-types/procurement.yaml
└── 10.45 config/case-types/general.yaml
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `apps/web/next.config.mjs` | 30 |
| 2 | `apps/web/tailwind.config.ts` | 40 |
| 3 | `apps/web/postcss.config.mjs` | 10 |
| 4 | `apps/web/drizzle.config.ts` | 20 |
| 5 | `apps/web/public/manifest.webmanifest` | 30 |
| 6 | `apps/web/public/sw.js` | 30 |
| 7 | `apps/web/src/app/layout.tsx` | 60 |
| 8 | `apps/web/src/app/(app)/layout.tsx` | 90 |
| 9 | `apps/web/src/app/(app)/folders/[id]/page.tsx` | 80 |
| 10 | `apps/web/src/app/(app)/folders/new/page.tsx` | 60 |
| 11 | `apps/web/src/app/(app)/settings/page.tsx` | 70 |
| 12 | `apps/web/src/app/(app)/settings/case-types/[slug]/page.tsx` | 90 |
| 13 | `apps/web/src/app/(app)/settings/audit/page.tsx` | 80 |
| 14 | `apps/web/src/app/api/folders/route.ts` | 60 |
| 15 | `apps/web/src/app/api/folders/[id]/route.ts` | 80 |
| 16 | `apps/web/src/app/api/files/upload/route.ts` | 150 |
| 17 | `apps/web/src/app/api/files/[id]/raw/route.ts` | 50 |
| 18 | `apps/web/src/app/api/files/[id]/ocr/route.ts` | 30 |
| 19 | `apps/web/src/app/api/chat/stream/route.ts` | 200 |
| 20 | `apps/web/src/app/api/chat/clear/route.ts` | 40 |
| 21 | `apps/web/src/app/api/chat/compact/route.ts` | 100 |
| 22 | `apps/web/src/app/api/stt/route.ts` | 80 |
| 23 | `apps/web/src/app/api/export/docx/route.ts` | 70 |
| 24 | `apps/web/src/app/api/health/route.ts` | 15 |
| 25 | `apps/web/src/app/api/ready/route.ts` | 50 |
| 26 | `apps/web/src/server/chat/build-request.ts` | 220 |
| 27 | `apps/web/src/server/chat/clear-handler.ts` | 40 |
| 28 | `apps/web/src/server/chat/compact-handler.ts` | 100 |
| 29 | `apps/web/src/server/chat/citation-verifier.ts` | 130 |
| 30 | `apps/web/src/server/actions/folders.ts` | 60 |
| 31 | `apps/web/src/server/actions/files.ts` | 50 |
| 32 | `apps/web/src/server/actions/messages.ts` | 40 |
| 33 | `apps/web/src/lib/case-types/loader.ts` | 60 |
| 34 | `apps/web/src/lib/case-types/validator.ts` | 80 |
| 35 | `apps/web/src/lib/markdown/render.tsx` | 100 |
| 36 | `apps/web/config/case-types/osago.yaml` | 60 |
| 37 | `apps/web/config/case-types/dtp.yaml` | 50 |
| 38 | `apps/web/config/case-types/labor.yaml` | 50 |
| 39 | `apps/web/config/case-types/family.yaml` | 50 |
| 40 | `apps/web/config/case-types/inheritance.yaml` | 50 |
| 41 | `apps/web/config/case-types/admin.yaml` | 50 |
| 42 | `apps/web/config/case-types/criminal.yaml` | 50 |
| 43 | `apps/web/config/case-types/procurement.yaml` | 50 |
| 44 | `apps/web/config/case-types/general.yaml` | 40 |

---

## PBS 11.0 apps/web — UI components (3-pane)

```
11.0 apps/web/src/components
├── 11.1 shell/AppShell.tsx
│   ├── 3-pane resizable splitter (react-resizable-panels)
│   ├── persist sizes в localStorage
│   └── slot для left | center | right
├── 11.2 shell/Header.tsx
│   └── topbar (logo, текущая папка, user menu logout)
├── 11.3 folder-tree/FolderTree.tsx
│   ├── список folders (filter archived)
│   ├── активная подсвечена
│   ├── + New
│   └── per-folder список files (collapsible)
├── 11.4 folder-tree/FolderItem.tsx
│   └── имя, case_type badge, archive button
├── 11.5 folder-tree/NewFolderDialog.tsx
│   └── modal с name + caseType select → POST /api/folders → router.push(`/folders/${id}`)
├── 11.6 chat/ChatPane.tsx
│   ├── useChat() из ai/react с endpoint /api/chat/stream
│   ├── DropZone wrapper (вокруг всего pane)
│   └── orchestrate ChatToolbar + MessageList + MessageComposer + QuotaIndicator
├── 11.7 chat/ChatToolbar.tsx
│   ├── 🧹 Очистить чат (Dialog confirm)
│   ├── 📦 Сжать историю (с loading state)
│   └── ⚙ EffortSlider (DropdownMenu)
├── 11.8 chat/MessageList.tsx
│   ├── virtualized scroll (наверх — старые)
│   └── рендер Message[]
├── 11.9 chat/Message.tsx
│   ├── markdown render
│   ├── tool-call как collapsible Card («🔧 search_npa(query: ...)»)
│   ├── thinking-delta как collapsible (по умолчанию свёрнут)
│   ├── citations [1], [2] → footnote list
│   └── per-message Экспорт .docx button
├── 11.10 chat/MessageComposer.tsx
│   ├── Textarea (auto-resize)
│   ├── Submit on Enter (Shift+Enter — новая строка)
│   ├── Drag&drop overlay
│   ├── Attach file button → useDropzone
│   └── VoiceButton inline
├── 11.11 chat/VoiceButton.tsx
│   ├── push-to-talk (mousedown / Spacebar hold)
│   ├── MediaRecorder({ mimeType: 'audio/webm;codecs=opus' })
│   ├── on stop → POST /api/stt → composer.value += text
│   └── визуальная индикация записи (пульсация)
├── 11.12 chat/EffortSlider.tsx
│   ├── 4 значения с подписями: Скорость · Стандарт · Глубоко · Максимум
│   ├── default = max (см. ADR effort)
│   └── PATCH /api/folders/[id] effort=...
├── 11.13 chat/QuotaIndicator.tsx
│   ├── читает claude_quota через server fetch (revalidate 60s)
│   ├── «Сообщений N/225 · сброс 18:30»
│   └── при quota=0 — disable submit + tooltip
├── 11.14 files/DropZoneOverlay.tsx
│   └── absolute overlay при drag (highlight, hint «Отпустите для загрузки»)
├── 11.15 files/FileCard.tsx
│   ├── имя + size + OCR badge (✓ done / ⏳ processing / ⚠ failed / — skipped)
│   ├── retry button (POST /api/files/[id]/ocr)
│   └── click → preview panel показать
├── 11.16 files/UploadProgress.tsx
│   └── inline progress bar для uploadHook
├── 11.17 preview/DocumentPreview.tsx
│   ├── pdf.js (pdfjs-dist) lazy import
│   ├── для image — <img>
│   ├── для docx/txt — server-render markdown view
│   └── error boundary
├── 11.18 preview/ExportToolbar.tsx
│   ├── Export .docx button
│   └── Print button (window.print)
├── 11.19 stores/ui-store.ts (Zustand)
│   ├── activeFolderId
│   ├── splitter sizes (left, right)
│   └── theme, dropZoneVisible
├── 11.20 stores/chat-store.ts (Zustand)
│   ├── isComposing
│   ├── voiceRecording
│   └── pendingAttachments
└── 11.21 hooks/use-folder.ts, use-files.ts, use-quota.ts (SWR wrappers)
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `apps/web/src/components/shell/AppShell.tsx` | 120 |
| 2 | `apps/web/src/components/shell/Header.tsx` | 60 |
| 3 | `apps/web/src/components/folder-tree/FolderTree.tsx` | 100 |
| 4 | `apps/web/src/components/folder-tree/FolderItem.tsx` | 60 |
| 5 | `apps/web/src/components/folder-tree/NewFolderDialog.tsx` | 100 |
| 6 | `apps/web/src/components/chat/ChatPane.tsx` | 130 |
| 7 | `apps/web/src/components/chat/ChatToolbar.tsx` | 90 |
| 8 | `apps/web/src/components/chat/MessageList.tsx` | 90 |
| 9 | `apps/web/src/components/chat/Message.tsx` | 200 |
| 10 | `apps/web/src/components/chat/MessageComposer.tsx` | 120 |
| 11 | `apps/web/src/components/chat/VoiceButton.tsx` | 130 |
| 12 | `apps/web/src/components/chat/EffortSlider.tsx` | 80 |
| 13 | `apps/web/src/components/chat/QuotaIndicator.tsx` | 70 |
| 14 | `apps/web/src/components/files/DropZoneOverlay.tsx` | 50 |
| 15 | `apps/web/src/components/files/FileCard.tsx` | 90 |
| 16 | `apps/web/src/components/files/UploadProgress.tsx` | 50 |
| 17 | `apps/web/src/components/preview/DocumentPreview.tsx` | 130 |
| 18 | `apps/web/src/components/preview/ExportToolbar.tsx` | 50 |
| 19 | `apps/web/src/stores/ui-store.ts` | 50 |
| 20 | `apps/web/src/stores/chat-store.ts` | 40 |
| 21 | `apps/web/src/hooks/use-folder.ts` | 30 |
| 22 | `apps/web/src/hooks/use-files.ts` | 30 |
| 23 | `apps/web/src/hooks/use-quota.ts` | 30 |

---

## PBS 12.0 apps/web — workers (pg-boss)

```
12.0 apps/web/workers
├── 12.1 queue.ts
│   ├── singleton PgBoss instance (lazy, env.DATABASE_URL)
│   ├── boot() — start + register handlers
│   └── enqueue helpers: enqueueOcr(fileId), enqueueEmbed(fileId)
├── 12.2 ocr-worker.ts
│   ├── pg-boss.work('ocr.run', { teamSize: 1, teamConcurrency: 1 }, handler)
│   ├── handler: SELECT file → orchestrator.runOcr → UPDATE files
│   ├── on done → enqueueEmbed(fileId)
│   └── на failed → ocr_status='failed', ocr_error=stack
├── 12.3 embed-worker.ts
│   ├── pg-boss.work('embed.run', { teamSize: 1, teamConcurrency: 1 }, handler)
│   ├── handler: SELECT file.ocr_text → upsert.embedAndUpsert(...)
│   └── batch embed-call (16 chunks at a time)
├── 12.4 entry.ts
│   ├── один CLI entry для оба worker'а:
│   │   process.env.WORKER_KIND === 'ocr' → boot ocr only
│   │   === 'embed' → boot embed only
│   │   === 'all' → both
│   └── tsup-bundle для PM2
└── 12.5 health.ts
    └── workers HTTP health endpoint :3011 / :3012 для PM2 + nginx (опционально)
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `apps/web/workers/queue.ts` | 90 |
| 2 | `apps/web/workers/ocr-worker.ts` | 100 |
| 3 | `apps/web/workers/embed-worker.ts` | 90 |
| 4 | `apps/web/workers/entry.ts` | 60 |
| 5 | `apps/web/workers/health.ts` | 40 |

---

## PBS 13.0 Build & Distribution

```
13.0 Build & Distribution
├── 13.1 ecosystem.config.cjs
│   ├── legal-ai-assistant-web (next standalone, port 3010, max_memory 900M, instances 1)
│   ├── legal-ai-assistant-ocr-worker (entry.ts WORKER_KIND=ocr, max 600M)
│   └── legal-ai-assistant-embed-worker (entry.ts WORKER_KIND=embed, max 800M)
├── 13.2 nginx vhost
│   ├── /etc/nginx/sites-available/<APP_DOMAIN>
│   ├── server :443 ssl http2 (или внутренний :8447 + stream{} SNI-routing на :443)
│   ├── proxy_pass http://127.0.0.1:3010
│   ├── client_max_body_size 60m
│   ├── proxy_buffering off (для SSE)
│   ├── proxy_read_timeout 600s
│   ├── /_next/static/ → expires 1y
│   └── HSTS, X-Frame-Options DENY, etc.
├── 13.3 Let's Encrypt
│   ├── certbot certonly --webroot -w /var/www/letsencrypt -d example.com --email user@example.com --agree-tos
│   └── /etc/letsencrypt/live/example.com/{fullchain,privkey}.pem
├── 13.4 DNS Timeweb
│   ├── A example.com → <SERVER_IP>, TTL 300
│   └── без AAAA (нет публичного IPv6)
├── 13.5 cron
│   ├── nightly: pnpm store prune (если место поджимает)
│   └── weekly: VACUUM ANALYZE postgres
├── 13.6 backup script
│   ├── ./scripts/backup.sh — pg_dump + tar uploads/
│   └── target ./backups/legal-ai-assistant-{ts}.tar.gz
└── 13.7 monitoring
    ├── /api/health (cheap) — nginx upstream check
    └── /api/ready (DB ping + freeMb) — внешний uptime monitor
```

### Files to create

| # | File | Lines (approx) |
|---|---|---|
| 1 | `ecosystem.config.cjs` | 70 |
| 2 | `/etc/nginx/sites-available/<APP_DOMAIN>` (внешний) | 80 |
| 3 | `scripts/backup.sh` | 40 |
| 4 | `scripts/cron/vacuum.sh` | 20 |

---

## Сводная статистика (all PBS)

| Phase / PBS | Files | Approx lines |
|---|---|---|
| 1.0 Infrastructure | 13 | ~530 |
| 2.0 packages/types | 9 | ~257 |
| 3.0 packages/db | 23 | ~1135 |
| 4.0 packages/sandbox | 11 | ~542 |
| 5.0 packages/claude-client | 15 | ~1075 |
| 6.0 packages/claude-tools | 16 | ~1300 |
| 7.0 packages/embeddings | 8 | ~447 |
| 8.0 packages/{ocr,stt,docx-export,ui} | 40 | ~1612 |
| 9.0 apps/web auth | 14 | ~830 |
| 10.0 apps/web App Router | 44 | ~3315 |
| 11.0 apps/web UI components | 23 | ~1850 |
| 12.0 apps/web workers | 5 | ~380 |
| 13.0 Build & Distribution | 4 | ~210 |
| **TOTAL** | **225** | **~13 500** |

> Это диапазон single-engineer'а на 6–8 недель: ~1.5–2k LOC/неделя при 70 % AI-генерации (см. правило 70/30).

---

## Cross-references

- Что строим → [PRD.md](./PRD.md)
- Архитектура и решения → [DESIGN_DOC.md](./DESIGN_DOC.md)
- TS-типы и interfaces → [INTERFACES.md](./INTERFACES.md)
- Дорожная карта → [ROADMAP.md](./ROADMAP.md)
- Журнал изменений → [CHANGELOG.md](./CHANGELOG.md)
