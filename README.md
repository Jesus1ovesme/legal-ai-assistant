# legal-ai-assistant

> Single-user web-сервис уровня «Claude Projects для юриста».
> Папки дел = чат-сессии. AI цитирует **актуальные** нормативно-правовые акты, а не выдумывает статьи.

[![Built with Claude](https://img.shields.io/badge/Built_with-Claude_Opus_4.7-A76E47?logo=anthropic&logoColor=white)](https://www.anthropic.com/claude)
[![Stack](https://img.shields.io/badge/stack-Next.js_15_%2B_PostgreSQL_%2B_pgvector-000000?logo=nextdotjs)](https://nextjs.org/)
[![Language](https://img.shields.io/badge/lang-TypeScript_strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Private-lightgrey.svg)](#)

---

## 🎯 Что это и зачем

Юрист загружает документы клиента (полис ОСАГО, протоколы, постановления, экспертизы, переписку) в **папку дела** — и затем общается с Claude в чате, привязанном к этой папке. Готовый ответ экспортирует в `.docx` и в Word доводит до финального документа (претензии, искового заявления, отзыва на иск).

**Главные принципы:**

- ✅ AI **цитирует** актуальные российские НПА с `pravo.gov.ru` и судебную практику с `sudact.ru` / `kad.arbitr.ru`, а не выдумывает статьи.
- ✅ Каждая папка дела — изолированная chat-сессия со своим `system prompt`, контекстом и инструментами (по типу: ОСАГО / ДТП / Трудовое / …).
- ✅ Файлы клиентов хранятся **локально**, на сервере владельца, никогда не уходят в третьи руки.

## ⚙️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  3-pane Web UI (Next.js 15 + React 19 + Tailwind v4)        │
│  ┌─────────────┬────────────────────────┬────────────────┐  │
│  │ Папки дел   │   Чат с ассистентом    │  Документы /   │  │
│  │ (sidebar)   │   (центр, drag&drop)   │  превью .docx  │  │
│  └─────────────┴────────────────────────┴────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
       Next.js API                   pg-boss worker
       (App Router)                  (OCR + embeddings)
            │                             │
       ┌────┴────────────────┐            │
       │                     │            │
  PostgreSQL 14         Anthropic API ────┘
  + pgvector            (Claude Opus 4.7
  + Drizzle ORM          + tool-use
  + iron-session         + extended thinking)
                              │
                    ┌─────────┴─────────────────┐
                    │ tool-use интеграции:      │
                    │ • pravo.gov.ru            │
                    │ • sudact.ru               │
                    │ • kad.arbitr.ru           │
                    │ • SearXNG (self-hosted)   │
                    └───────────────────────────┘
```

## 🧰 Ключевые возможности

| | |
|---|---|
| 🗂️ **Папки дел** | каждая папка — отдельная chat-сессия с собственным контекстом и набором инструментов |
| 🔧 **Tool-use Claude** | ассистент сам ходит за нормативкой, судебной практикой, арбитражем |
| 🖼️ **OCR** | Tesseract `rus+eng` для русских сканов; результат сразу попадает в контекст дела |
| 🎤 **Голосовой ввод** | Whisper API для надиктовки запросов |
| 📄 **Экспорт в `.docx`** | сохраняется форматирование (списки, таблицы, выделения) — открывается в Word без правок |
| 🧠 **Мини-RAG** | эмбеддинги `intfloat/multilingual-e5-large` в pgvector над папкой дела |
| 🌐 **Web-поиск** | через self-hosted SearXNG — без зависимости от платных API |
| 🧹 **Управление контекстом** | кнопки `🧹 Очистить чат` и `📦 Сжать историю` прямо в UI |

## 🔐 Безопасность

- **File sandbox:** документы хранятся в `<UPLOADS>/<folderId>/<sha256>.<ext>` с magic-byte валидацией и `lstat` symlink-check.
- **Tool isolation:** все интеграции read-only; `folder_id` инжектится сервером — Claude технически не может прочитать чужую папку.
- **SSRF guard** на `fetch_web_page`: DNS + IP blocklist + connect-by-IP.
- **Citation verifier:** пост-проверка цитат НПА, second-pass запрос если AI выдумал статью.

## 📦 Стек

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui
- **Backend:** Next.js API routes · iron-session (AES-256-GCM cookies) · pg-boss worker queue
- **БД:** PostgreSQL 14 + pgvector + Drizzle ORM
- **AI:** Anthropic SDK (Claude Opus 4.7 + tool-use + extended thinking 32k)
- **OCR:** Tesseract `rus+eng` (через worker)
- **Embeddings:** `intfloat/multilingual-e5-large` локально
- **STT:** OpenAI Whisper API
- **Web search:** self-hosted SearXNG

## 🚀 Запуск

### Dev

```bash
pnpm install
pnpm db:migrate
pnpm bootstrap:user   # создаёт первого юзера из .env BOOTSTRAP_* переменных
pnpm dev              # → http://127.0.0.1:3010
```

### Production (PM2)

```bash
pnpm -F @legal-ai-assistant/web build   # next standalone
pm2 start ecosystem.config.cjs          # 3 процесса: web · ocr-worker · embed-worker
pm2 save && pm2 startup systemd         # одноразово на новом хосте
```

Nginx: loopback `:8447` + SNI-routing на `:443` через stream-блок. TLS — Let's Encrypt.

## 🔑 Конфигурация

Все секреты — через `.env` (см. [`.env.example`](./.env.example)). Минимальный набор:

```env
DATABASE_URL=postgresql://user:CHANGE_ME@127.0.0.1:5432/legal_db
SESSION_PASSWORD=<32+ байт случайных, base64url>
APP_ACCESS_KEY=<секретный ключ для login-формы>
BOOTSTRAP_EMAIL=user@example.com
BOOTSTRAP_PASSWORD=<пароль первого юзера>
ANTHROPIC_API_KEY=<sk-ant-…>
```

## 📚 Документация

| Файл | Содержание |
|---|---|
| [`PRD.md`](./PRD.md) | Product Requirements: видение, аудитория, user stories, compliance |
| [`DESIGN_DOC.md`](./DESIGN_DOC.md) | Архитектура: модули, потоки данных, схемы |
| [`PBS_ATOMIC.md`](./PBS_ATOMIC.md) | Product Breakdown Structure до атомарного уровня |
| [`INTERFACES.md`](./INTERFACES.md) | TypeScript-интерфейсы и типы |
| [`ROADMAP.md`](./ROADMAP.md) | Дорожная карта (фазы, milestones) |
| [`CHANGELOG.md`](./CHANGELOG.md) | История изменений |
| [`USER_GUIDE.md`](./USER_GUIDE.md) | Руководство пользователя (юриста) |

## 📝 Лицензия

Private use. Контакты владельца — см. профиль [`github.com/Jesus1ovesme`](https://github.com/Jesus1ovesme).
