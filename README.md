# danilurist

AI-помощник для юриста. Single-user web-приложение, размещаемое на `example.com`.

## Что это

- 3-pane web UI: дерево папок (дел) · чат с drag&drop · preview документа.
- Папка = чат-сессия (как Claude Projects). Тип дела (ОСАГО / ДТП / Трудовое / …) задаёт system prompt и набор инструментов.
- Файлы юриста изолированы внутри `<UPLOADS_ROOT>/<folderId>/`.
- AI — Claude (Opus 4.7 + thinking 32k по default), tool-use на лету: pravo.gov.ru, sudact.ru, kad.arbitr.ru (best-effort), web-поиск через self-hosted SearXNG.
- OCR русских сканов (Tesseract), экспорт ответов в .docx, голосовой ввод (Whisper API), кнопки `🧹 Очистить чат` и `📦 Сжать историю` в UI.

## Стек

Next.js 15 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui · PostgreSQL 14 + pgvector + Drizzle ORM + pg-boss · iron-session · Anthropic SDK · `intfloat/multilingual-e5-large` локально для embeddings · Tesseract `rus+eng`.

Подробности: см. [`DESIGN_DOC.md`](./DESIGN_DOC.md) · [`PBS_ATOMIC.md`](./PBS_ATOMIC.md) · [`INTERFACES.md`](./INTERFACES.md) · [`ROADMAP.md`](./ROADMAP.md).

## Запуск (dev)

```bash
pnpm install
pnpm db:migrate
pnpm bootstrap:user
pnpm dev
```

Открыть http://127.0.0.1:3010, залогиниться `user@example.com` / пароль из плана.

## Production

```bash
pnpm build
pnpm start:prod        # PM2: web :3010 + ocr-worker + embed-worker
```

Nginx: `/etc/nginx/sites-available/<APP_DOMAIN>` (loopback :8447 + SNI-routing на :443 через stream-блок). TLS — Let's Encrypt.

## Безопасность

- File sandbox: `<UPLOADS>/<folderId>/<sha256>.<ext>` с magic-byte и lstat-symlink check.
- Tools — все read-only, `folder_id` инжектится сервером (Claude не может прочитать чужую папку).
- SSRF guard на `fetch_web_page` (DNS + IP blocklist + connect-by-IP).
- Citation verifier: пост-проверка цитат НПА, second-pass если AI выдумал статью.
