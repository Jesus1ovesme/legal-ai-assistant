# ROADMAP — danilurist

> Дорожная карта проекта. Каждая фаза — отдельный milestone с конкретными deliverables и зависимостями.
> Cross-references: [PRD.md](./PRD.md), [DESIGN_DOC.md](./DESIGN_DOC.md), [PBS_ATOMIC.md](./PBS_ATOMIC.md), [INTERFACES.md](./INTERFACES.md).

**Условные обозначения**:
- ☑ — done
- ☐ — planned
- 🔄 — in progress
- 🛑 — blocked

**Приоритеты**:
- **P0** — блокер (без него фаза не запускается)
- **P1** — критично (без него фаза не считается завершённой)
- **P2** — важно (можно отложить, но желательно в фазе)
- **P3** — nice to have (отложено в backlog)

---

## Phase 0 — Pre-step (инфра-готовность)

**Цель**: подготовить окружение до старта реализации.

**Задачи**:
- ☑ DNS Timeweb: A-запись `example.com → <SERVER_IP>`, TTL 300 *(P0)*
- ☐ Anthropic API key, положить в `.env` как `ANTHROPIC_API_KEY=sk-ant-...` *(P0)*
- ☑ PostgreSQL 14 + pgvector 0.8.2 + pg_trgm установлены *(P0)*
- ☑ БД `danilurist_db` создана, role `danilurist` с привилегиями *(P0)*
- ☑ Каталог `<UPLOADS_ROOT>` (mode 750) *(P0)*
- ☑ Подтверждено 443 для SNI (nginx уже настроен с stream{} SNI-routing для <EXISTING_INFRA_HOST>) *(P1)*
- ☐ OpenAI API key (для STT) в `.env` *(P2)*
- ☐ Установка SearXNG self-host на `127.0.0.1:8888` *(P2)*

**Result**: Env готов. ENV-переменные заполнены, DB поднята, домен делегирован.
**ETA**: 1 день (manual setup).
**Dependencies**: VPS `<SERVER_IP>` доступен (уже есть).
**Risks**:
- Anthropic geo-block RU → fallback на `CLAUDE_TRANSPORT=api+proxy` через Xray на <PROXY_HOST>.

---

## Phase 1 — Foundation (без AI)

**Цель**: рабочее single-user web-приложение с папками и файлами, **БЕЗ AI**.

**PBS включаемые**:
- ☐ PBS 1.0 Infrastructure (полный — `ecosystem.config.cjs`, `bootstrap-user.ts`)
- ☐ PBS 2.0 packages/types
- ☐ PBS 3.0 packages/db (schema + queries + migration 0001)
- ☐ PBS 4.0 packages/sandbox (paths, magic, validate, store, errors + tests)
- ☐ PBS 9.0 apps/web auth + middleware (login, session, csrf, bootstrap)
- ☐ PBS 10.0 (частично):
  - ☐ next.config.mjs, tailwind, drizzle.config.ts
  - ☐ layout.tsx + (auth)/login + (app)/layout.tsx
  - ☐ /api/auth/* (login/logout/csrf)
  - ☐ /api/folders/* (CRUD)
  - ☐ /api/files/upload (upload + sandbox + INSERT files, БЕЗ pg-boss enqueue)
  - ☐ /api/files/[id]/raw, /api/health, /api/ready
- ☐ PBS 11.0 (частично):
  - ☐ shell/AppShell.tsx (3-pane resizable)
  - ☐ folder-tree/{FolderTree, FolderItem, NewFolderDialog}
  - ☐ files/{DropZoneOverlay, FileCard, UploadProgress}
  - ☐ stores/ui-store.ts

**Result**: 
- Можно зайти на `http://127.0.0.1:3010/login`, ввести `user@example.com` + пароль из BOOTSTRAP_PASSWORD в .env.
- Создать папку «ОСАГО / Иванов / РСА» (тип OSAGO).
- Загрузить PDF/DOCX в папку, увидеть в списке (sandbox path = `<UPLOADS>/<folderId>/<sha256>.<ext>`).
- AI ОТСУТСТВУЕТ — chat pane показывает «Configure ANTHROPIC_API_KEY».

**ETA**: 1.5 недели.
**Dependencies**: Phase 0 done.
**Risks**: 
- Drizzle + pgvector — нужна правильная регистрация custom column type vector(N) в drizzle. Mitigation: использовать sql template tag.

---

## Phase 2 — Chat (Claude streaming, без tools и RAG)

**Цель**: полноценный чат per folder с Claude через прямой Anthropic API. Tools и RAG — позже.

**PBS включаемые**:
- ☐ PBS 5.0 packages/claude-client (полный):
  - ☐ types, direct-transport, stream, retry, effort, pricing, redact
  - ☐ proxy-transport (на slot, тестируется в Phase 5)
  - ☐ relay-transport stub (throws)
  - ☐ system-blocks (BASE_GUIDELINES + buildSystemBlocks)
  - ☐ tool-runtime (skeleton — full tool-loop в Phase 4)
- ☐ PBS 10.0 (продолжение):
  - ☐ /api/chat/stream (SSE, tool-loop НЕ активен пока tools list пуст)
  - ☐ /api/chat/clear
  - ☐ /api/chat/compact (Haiku call для summary)
  - ☐ src/server/chat/build-request.ts (без mention parsing пока)
  - ☐ src/server/chat/clear-handler.ts, compact-handler.ts
  - ☐ src/lib/case-types/{loader, validator}.ts
  - ☐ apps/web/config/case-types/*.yaml (9 файлов)
- ☐ PBS 11.0 (продолжение):
  - ☐ chat/ChatPane.tsx (useChat from ai/react)
  - ☐ chat/ChatToolbar.tsx (🧹 Clear · 📦 Compact · ⚙ Effort)
  - ☐ chat/MessageList.tsx, Message.tsx
  - ☐ chat/MessageComposer.tsx
  - ☐ chat/EffortSlider.tsx
  - ☐ chat/QuotaIndicator.tsx (читает claude_quota)
  - ☐ stores/chat-store.ts
  - ☐ src/lib/markdown/render.tsx

**Result**:
- В выбранной папке можно писать сообщения, получать SSE-стрим ответа Claude.
- ChatToolbar работает: 🧹 архивирует messages, 📦 вызывает Haiku для summary.
- EffortSlider per-folder сохраняется. По умолчанию max → opus-4-7 + thinking 32k.
- QuotaIndicator показывает rate-limit observed из anthropic-ratelimit-* headers.

**ETA**: 1 неделя.
**Dependencies**: Phase 1 done, ANTHROPIC_API_KEY заполнен.

---

## Phase 3 — Tooling (OCR + DOCX + STT + Preview)

**Цель**: документы реально обрабатываются (OCR), экспорт ответов в Word, голосовой ввод, preview справа.

**PBS включаемые**:
- ☐ PBS 8.1 packages/ocr (pdf, image, docx, orchestrator)
- ☐ PBS 8.2 packages/stt (openai-api, whisper-cpp fallback, transcode)
- ☐ PBS 8.3 packages/docx-export (markdown, render, styles)
- ☐ PBS 12.0 apps/web/workers (queue, ocr-worker, embed-worker stub, entry)
- ☐ PBS 10.0 (продолжение):
  - ☐ /api/files/upload (добавить pg-boss enqueue 'ocr.run')
  - ☐ /api/files/[id]/ocr (retry button)
  - ☐ /api/stt
  - ☐ /api/export/docx
- ☐ PBS 11.0 (продолжение):
  - ☐ chat/VoiceButton.tsx (push-to-talk)
  - ☐ preview/DocumentPreview.tsx (pdf.js)
  - ☐ preview/ExportToolbar.tsx
- ☐ Обновить `ecosystem.config.cjs` — добавить ocr-worker процесс
- ☐ FileCard показывает OCR badge (pending / processing / done / failed / skipped)

**Result**:
- Загруженные PDF/JPG/PNG получают `ocr_status='done'` + `ocr_text` за <60 сек.
- DOCX и TXT обрабатываются через mammoth/raw read.
- Audio (webm/wav) → 'skipped'.
- Voice button в composer — hold Space → диктовка → текст.
- Любое assistant-сообщение → клик «Экспорт .docx» → файл скачивается.
- Preview справа — PDF через pdf.js, image inline, txt/docx — markdown.

**ETA**: 1 неделя.
**Dependencies**: Phase 2 done.
**Risks**:
- Tesseract скан 5 страниц > 60s на наших CPU → mitigation: --psm 1 + `pdftoppm -r 200` (не 300).

---

## Phase 4 — RAG + Tools + Citation Verifier

**Цель**: AI цитирует **только подтверждённые** НПА и судпрактику. Семантический поиск по файлам папки. 9 tools.

**PBS включаемые**:
- ☐ PBS 6.0 packages/claude-tools (все 9 tools + helpers/{cache, http, ssrf})
- ☐ PBS 7.0 packages/embeddings (e5-local, openai slot, chunker, upsert)
- ☐ PBS 12.0 apps/web/workers (embed-worker полная реализация)
- ☐ PBS 5.0 (продолжение):
  - ☐ tool-runtime — полный tool-loop (max 8 итераций, max 5 повторов одной тулзы)
- ☐ PBS 10.0 (продолжение):
  - ☐ build-request.ts: mention parsing @<name>, inline @file:<name> в `<document>` блоки, dynamic compaction при >60k tokens
  - ☐ citation-verifier.ts (extract regex + cross-check tool_call_log + 2nd pass)
- ☐ PBS 11.0 (продолжение):
  - ☐ Message.tsx: tool-call collapsible panels, thinking-delta panel, footnote citations [1] [2]
  - ☐ ⚠ badge на unverified citations
- ☐ Обновить `ecosystem.config.cjs` — добавить embed-worker процесс

**Result**:
- В чате при запросе «согласно ст. 12 ФЗ-40» AI вызывает `search_npa` → `fetch_npa_document`, цитирует с URL, сноска `[1]`.
- Citation verifier post-pass: если AI «вспомнил» статью без вызова — second-pass запрос, либо ⚠ badge.
- `semantic_search_in_folder` работает: загружаем 10 страниц текста → e5-large embed batch → pgvector cosine top-8.
- `cross_folder_search` enforced: без `@<имя>` в чате — handler throws.
- `fetch_web_page` SSRF guard: `http://127.0.0.1:5432` отвергается.
- UI показывает tool-call карточки коллапсируемые («🔧 search_npa(query: ...) → 5 результатов»).

**ETA**: 2 недели (самая большая фаза).
**Dependencies**: Phase 3 done. SearXNG self-host настроен.
**Risks**:
- e5-large на CPU — первая загрузка модели ~30s. Mitigation: lazy load + warmup в instrumentation.ts.
- pravo.gov.ru endpoint нестабилен → fallback цепочка JSON → HTML scrape → web_search.
- kad.arbitr.ru за DDoS-Guard → Playwright sidecar best-effort + circuit breaker.

---

## Phase 5 — Deploy (production URL)

**Цель**: production-готовый `https://example.com` со всеми security headers, TLS, мониторингом.

**PBS включаемые**:
- ☐ PBS 13.0 (полный):
  - ☐ ecosystem.config.cjs финальный (3 процесса: web + ocr + embed)
  - ☐ /etc/nginx/sites-available/<APP_DOMAIN> vhost (TLSv1.2/1.3, HSTS, X-Frame-Options, proxy_buffering off для SSE)
  - ☐ certbot certonly --webroot для example.com
  - ☐ DNS уже сделан в Phase 0 — verify
  - ☐ pm2 startup systemd + pm2 save
  - ☐ Backup script (pg_dump + tar uploads/)
  - ☐ Cron: nightly pnpm store prune, weekly VACUUM ANALYZE
- ☐ Smoke-tests на production URL (см. план §«Verification»)
- ☐ /api/ready: DB ping + freeMb >1500 проверка
- ☐ Тестовый прогон Anthropic geo-block fallback (`api+proxy` через socks5h://<PROXY_HOST>:1080)

**Result**:
- `curl -I https://example.com` → `HTTP/2 200`, `strict-transport-security: max-age=31536000`.
- `curl -i https://example.com/login` → 200, форма логина.
- POST `/login` с email + password → 302 + Set-Cookie.
- E2E: создать папку, загрузить PDF, дождаться OCR, спросить AI «составь претензию» → получить ответ с цитатами `[1] pravo.gov.ru/...`, экспорт в .docx, открыть в Word.

**ETA**: 1 неделя.
**Dependencies**: Phase 4 done.
**Risks**:
- nginx stream{} SNI-routing на :443 уже работает для <EXISTING_INFRA_HOST> — нужно вписать example.com как ещё один backend без поломки существующих сервисов. Mitigation: тщательный `nginx -T` review + reload, не restart.

---

## Phase 6+ — Backlog (post-MVP)

Не входит в первоначальный 6-8 недельный план, но запланировано.

| Feature | Priority | Notes |
|---|---|---|
| Multi-user (роли + шаринг папок) | P3 | `users.id` + `folders.user_id` FK уже мульти-готовы |
| Hard delete файла + retention 30 days | P3 | сейчас soft delete (archived flag) |
| Файловые шорт-теги (`@file:Полис`) автокомплит | P2 | сейчас только текстом |
| Inline edit `system_prompt` папки в UI | P3 | сейчас только через `/settings/case-types/[slug]` |
| Email-уведомления (на готовый OCR / completion) | P3 | nodemailer; нет приоритета у single-user |
| OAuth-релей (релей Max-подписки) | P3 | `relay-transport.ts` слот уже есть |
| Local Whisper-large вместо API | P3 | требует +8 GB RAM или GPU |
| Auto-summary длинных PDF | P2 | при upload — превью 500 токенов сразу для UI |
| PWA offline (service worker cache) | P3 | sw.js stub есть |
| Mobile-friendly layout (1-pane swipe) | P2 | resizable splitter не работает на mobile |
| Audit dashboard (`/settings/audit/*`) | P2 | таблица tokens/cost/latency |
| FTS на `messages.content` (pg_trgm GIN) | P3 | поиск по чату |
| OCR PII redaction (ФИО / паспорт / СНИЛС) | P2 | при появлении клиентов через сервис |

---

## Milestones

| Milestone | Состав | Done when |
|---|---|---|
| **M1 — Login + Folders + Upload** | Phase 0+1 | Можно залогиниться, создать папку, загрузить файл, увидеть его в списке |
| **M2 — Chat works** | Phase 2 | В папке можно беседовать с Claude, видеть streaming, пользоваться 🧹 / 📦 / Effort |
| **M3 — OCR + DOCX + Voice** | Phase 3 | Скан PDF получает `ocr_text`, любой ответ AI экспортируется в Word, push-to-talk диктовка работает |
| **M4 — RAG + НПА + Citations** | Phase 4 | AI цитирует ст. 12 ФЗ-40 со ссылкой на pravo.gov.ru, semantic search по файлам папки работает, citation verifier помечает выдумки ⚠ |
| **M5 — Production** | Phase 5 | `https://example.com` доступен из интернета, TLS, все health-checks зелёные |

---

## Total ETA

**6–8 недель** single-engineer при правиле 70/30 (70 % AI-генерации, 30 % human review):

- Phase 0: 1 день
- Phase 1: 1.5 нед
- Phase 2: 1 нед
- Phase 3: 1 нед
- Phase 4: 2 нед (самая объёмная)
- Phase 5: 1 нед

≈ 6.5 нед при отсутствии блокеров.

---

## Cross-references

- Что строим → [PRD.md](./PRD.md)
- Архитектура и решения → [DESIGN_DOC.md](./DESIGN_DOC.md)
- Атомарная декомпозиция файлов → [PBS_ATOMIC.md](./PBS_ATOMIC.md)
- TS-типы и interfaces → [INTERFACES.md](./INTERFACES.md)
- Журнал изменений → [CHANGELOG.md](./CHANGELOG.md)
