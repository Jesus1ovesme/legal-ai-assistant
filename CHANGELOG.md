# Changelog

Все значимые изменения проекта **danilurist** фиксируются в этом файле в обратном хронологическом порядке.

Категории: `added`, `changed`, `fixed`, `removed`, `infrastructure`.

---

## [2026-05-04] — Инициализация проекта

- **added**: Проектная документация (`PRD.md`, `DESIGN_DOC.md`, `PBS_ATOMIC.md`, `INTERFACES.md`, `ROADMAP.md`, `CHANGELOG.md`).
- **added**: Структура monorepo — `apps/web` (Next.js 15) + 9 packages (`types`, `db`, `claude-client`, `claude-tools`, `sandbox`, `ocr`, `stt`, `docx-export`, `embeddings`, `ui`), `pnpm-workspace.yaml`, `turbo.json`.
- **added**: TypeScript strict + ESM конфигурация (`tsconfig.base.json` + composite refs, `noUncheckedIndexedAccess`, `noImplicitOverride`).
- **added**: ESLint 9 + Prettier 3 (`.eslintrc.cjs`, `.prettierrc`).
- **added**: `.env.example` с полным набором переменных (auth, DB, Anthropic, embeddings, STT, SearXNG, file sandbox, logging).
- **added**: README.md с quickstart и ссылками на доки.
- **infrastructure**: PostgreSQL 14 + pgvector 0.8.2 + pg_trgm установлены и работают на VPS `<SERVER_IP>`.
- **infrastructure**: БД `danilurist_db` создана, role `danilurist` с привилегиями GRANT.
- **infrastructure**: Каталог `<UPLOADS_ROOT>` (mode 750) подготовлен.
- **infrastructure**: Решение по транспорту: `CLAUDE_TRANSPORT=api` для MVP. Релей `<PROXY_HOST>` — это VPN/Xray, не OAuth-прокси к Claude. Slot `relay-transport.ts` оставлен в `packages/claude-client` как заглушка под будущую интеграцию.
- **commit**: будет добавлен после первого коммита (`feat: initial project setup`).
