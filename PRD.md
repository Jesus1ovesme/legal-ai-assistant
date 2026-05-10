# PRD — danilurist

> Product Requirements Document для AI-помощника российского юриста-практика.
> Размещение: `example.com` → `<SERVER_IP>:443`. Single-user, частное использование.
> Дата создания: 2026-05-04. Cross-references: [DESIGN_DOC.md](./DESIGN_DOC.md), [PBS_ATOMIC.md](./PBS_ATOMIC.md), [INTERFACES.md](./INTERFACES.md), [ROADMAP.md](./ROADMAP.md).

---

## 1. Видение

**danilurist** — это персональный AI-помощник для практикующего юриста, заменяющий собой сразу: справочно-правовую систему, заметочник по делам и черновую печатную машинку. Юрист загружает документы клиента (полис ОСАГО, протоколы, постановления, экспертизы, переписка) в **папку дела**, а затем общается с Claude в чате, привязанном к этой папке. AI цитирует **актуальные** российские НПА с `pravo.gov.ru` и судебную практику с `sudact.ru` / `kad.arbitr.ru`, а не выдумывает статьи. Готовый ответ юрист экспортирует в `.docx` и в Word доводит до финального документа (претензии, искового заявления, отзыва на иск). Цель — экономить ≥2 часов рутины в день и убрать риск «галлюцинаций» AI на боевом юр. контенте.

---

## 2. Целевая аудитория

| Параметр | Значение |
|---|---|
| Пользователь | Один практикующий юрист (друг автора) |
| Режим | Single-user MVP, **никаких клиентских аккаунтов** |
| Использование | Частное, для своих рабочих задач (не SaaS, не B2B) |
| Compliance | 152-ФЗ требования к операторам ПДн **не возникают**, потому что нет третьих лиц-субъектов; данные клиентов юрист обрабатывает в рамках своего профессионального долга, как и в Word/CП |
| Уровень техн. подготовки | Low: ожидает «human UI», ненавидит командную строку (предыдущий инструмент `<EXISTING_INFRA_HOST>` слишком «программистский») |
| Доступ | Только владелец домена, по фиксированному паролю (см. ENV `BOOTSTRAP_PASSWORD`) |

---

## 3. User stories / use cases

### 3.1. Создание дела по ОСАГО

> **Как юрист**, когда ко мне обращается клиент по невыплате ОСАГО, я хочу создать папку дела «ОСАГО / Иванов / РСА», загрузить туда полис, акт независимой оценки, отказное письмо страховой и одной фразой получить черновик претензии со ссылками на ст. 12 ФЗ-40 и на Положение БР №431-П.

**Шаги**:
1. Левый pane → «+ Папка» → выбрать тип **OSAGO** → имя «ОСАГО / Иванов / РСА».
2. В чате drag&drop трёх PDF (полис, акт, отказ).
3. Пишу: «Подготовь претензию по ОСАГО на основе документов в этой папке. Сумма требования = разница между независимой оценкой и выплатой страховой».
4. AI вызывает `read_file_in_folder`, `search_npa`, `search_court_practice`, генерирует претензию с цитатами `[1]`, `[2]`.
5. Жму «Экспорт в .docx» → правлю в Word.

### 3.2. Подготовка иска (аналогично, но для суда)

Как 3.1, но запрос: «Преврати претензию в исковое заявление в районный суд по месту жительства истца. Включи требование о неустойке по ст. 16.1 ФЗ-40 и моральном вреде по ст. 15 Закона о защите прав потребителей».

### 3.3. Проверка документов перед подачей

> **Как юрист**, перед подачей иска я хочу выгрузить готовый документ обратно в папку и попросить «найди ошибки в реквизитах, проверь правильность ссылок на статьи, проверь что суммы сходятся».

AI использует `read_file_in_folder` + `semantic_search_in_folder` по другим документам в папке (квитанции, расчёты) для перекрёстной сверки.

### 3.4. Поиск НПА и судпрактики по теме

> **Как юрист**, когда у меня нет документов клиента, а есть только тема («неустойка по 214-ФЗ за просрочку сдачи квартиры»), я хочу получить актуальную подборку НПА + позицию ВС РФ + типовые формулировки исков.

AI вызывает `search_npa` (pravo.gov.ru) + `search_court_practice` (sudact.ru) + `web_search` (SearXNG).

### 3.5. Голосовой ввод вопроса

> **Как юрист**, когда я еду в машине или у меня заняты руки на бумагах, я хочу зажать «Пробел» в браузере и надиктовать 30-секундный вопрос.

`MediaRecorder` → blob → `/api/stt` → OpenAI Whisper API → текст вставляется в композер.

### 3.6. Экспорт в .docx для финальной правки в Word

> **Как юрист**, я не хочу копи-пастить AI-ответ в Word и вручную восстанавливать форматирование (заголовки, нумерация, сноски).

Кнопка «Экспорт в .docx» под ответом → `mdast → docx`-конвертер генерирует A4-документ Times New Roman 12, с сохранением иерархии заголовков и **сносок-цитат**.

---

## 4. Ключевые экраны

### 4.1. Логин (`/login`)

Простая форма: email + пароль + CSRF-токен. После успешной аутентификации — редирект на последнюю открытую папку или на `/folders/new`.

### 4.2. Главный экран — 3-pane shell (`/folders/[id]`)

```
┌──────────────────────┬───────────────────────────────────────┬──────────────────────┐
│  📁 ПАПКИ            │   💬 ЧАТ — «ОСАГО / Иванов / РСА»     │  📄 PREVIEW           │
│  ────────────────    │   ─────────────────────────────────   │  ──────────────────   │
│  ▸ ОСАГО / Иванов    │   🧹 Очистить · 📦 Сжать · ⚙ Эффорт ▼ │  Полис_ОСАГО.pdf     │
│  ▸ ДТП / Петров      │                                       │  ┌────────────────┐  │
│  ▸ Трудовое / Сидоров│  user: Подготовь претензию...         │  │  pdf.js render │  │
│  + Новая папка       │  asst: [tool] search_npa(...)         │  │  (плавный      │  │
│                      │       Согласно ст. 12 ФЗ-40 [1]...    │  │  скролл)       │  │
│  📎 Файлы папки      │       [Экспорт .docx]                 │  └────────────────┘  │
│  • Полис.pdf  [OCR✓] │                                       │                       │
│  • Акт.pdf    [OCR✓] │  ┌─ Сообщения 14/225 · сброс 18:30 ─┐ │  [Экспорт .docx]      │
│  • Отказ.pdf  [OCR…] │  │ [textarea] 🎙 push-to-talk      │ │                       │
│                      │  └────────────────────────────────┘ │                       │
└──────────────────────┴───────────────────────────────────────┴──────────────────────┘
```

**Ключевые элементы**:

- **Левый pane** — `FolderTree` с дерево папок (1 уровень в MVP), список файлов текущей папки с OCR-бэйджами.
- **Центр** — `ChatPane`:
  - **`ChatToolbar`** — `🧹 Очистить чат` · `📦 Сжать историю` · `⚙ EffortSlider`.
  - `MessageList` с поддержкой **markdown + tool-call коллапсируемых панелей + `thinking-delta` блока** + цитат `[1]`, `[2]`.
  - **`MessageComposer`** с textarea, drag&drop overlay, **`VoiceButton`** (push-to-talk на Space или mousedown).
  - **`QuotaIndicator`** — счётчик «Сообщений N/225 · сброс 18:30» из Anthropic rate-limit headers.
- **Правый pane** — `DocumentPreview` (pdf.js на клиенте) + `ExportToolbar` с кнопкой «Экспорт .docx».

### 4.3. Настройки (`/settings`)

Смена пароля, переключение Effort default, аудит turn-ов, статус ready/health.

### 4.4. Редактирование case-type (`/settings/case-types/[slug]`)

YAML-редактор для system_prompt/document_checklist/applicable_npa/default_tools одного из 9 типов дел. Сохраняется в файл `apps/web/config/case-types/<slug>.yaml`.

---

## 5. Data model

Упрощённая ER-диаграмма (полная DDL — в [DESIGN_DOC.md §6](./DESIGN_DOC.md#6-storage-schema)):

```
users (1) ──< folders (1) ──< files
                  │              │
                  │              └──< embeddings (vector 1024)
                  │
                  └──< messages (1) ──< tool_calls (jsonb)
                  
sessions (auth)   audit_log (per turn)   tool_call_log (per call)
caches: npa_search_cache, npa_doc_cache, court_search_cache
quota: claude_quota
```

| Сущность | Что хранит | Ключевые ограничения |
|---|---|---|
| `users` | владелец (один) | `email UNIQUE`, bcrypt(12) hash |
| `folders` | дело = чат-сессия | `case_type ENUM`, `system_prompt text` (копия из YAML), `effort` |
| `files` | загруженные документы | `UNIQUE(folder_id, sha256)` дедупликация, `ocr_status` ENUM |
| `messages` | история чата | `archived` (для `/clear`), `turn_id uuid` группа tool-loop'а |
| `embeddings` | RAG чанки | `vector(1024)` HNSW (m=16, ef_construction=64), `folder_id` для изоляции |
| `audit_log` | каждый turn | tokens in/out, cache read/write, latency, cost USD |
| `tool_call_log` | каждый tool-вызов | input/output jsonb, latency, error |
| `npa_*_cache` / `court_search_cache` | результаты внешних API | hash key, TTL логически |
| `claude_quota` | rate-limit observed | requests_left / tokens_left из Anthropic headers |

ULID (26 char) везде кроме `audit_log.id` (bigserial для сортировки) и `messages.turn_id` (uuid v7).

---

## 6. Non-functional requirements

| Категория | Требование | Замечание |
|---|---|---|
| **Latency** | SSE first-chunk **p95 < 2s** | от `submit` до первого SSE-event'а в браузере |
| **Throughput chat** | 1 одновременный chat (single-user) | tool-loop max 8 итераций |
| **File upload** | до **50 MB**, 10 файлов/запрос | NUL/path-guard, magic-byte check |
| **OCR** | один скан на 5 страниц **< 60 сек** | 1 worker, teamConcurrency=1 |
| **Embeddings** | 1 файл ~10 страниц **< 30 сек** | e5-large CPU, batch 16 |
| **STT** | 30-сек запись **< 8 сек** | OpenAI Whisper API |
| **Доступность** | **99 %** uptime на single VPS | PM2 restart, nginx, no clustering |
| **RAM** | total ≤ **5 GB** на трёх процессах | web 900M + ocr 600M + embed 800M = 2.3G; запас ≥1G |
| **Disk** | ≤ **8 GB** для приложения + uploads | при 11 GB free на VPS |
| **TLS** | TLSv1.2/1.3, HSTS 1y | Let's Encrypt |

---

## 7. Ограничения

- **Single-user MVP**: один пользователь, никаких ролей и шаринга. Multi-user отложен до v2.
- **152-ФЗ**: данные клиентов юриста относятся к категории профессиональной тайны, обрабатываются в рамках адвокатской/юридической деятельности. Третьих лиц с правами субъекта ПДн в системе нет → обязанности оператора ПДн **не наступают** в MVP.
- **Нет PII redaction**: ФИО / номера паспортов / СНИЛС в OCR-тексте не маскируются. Юрист сам контролирует, что грузит.
- **Disk 11 GB free** → никаких сторонних предындексов НПА. Только on-the-fly tool-use. PDF preview исключительно через pdf.js на клиенте.
- **RAM 5.8 GB total** → Whisper local запрещён, только OpenAI Whisper API (fallback `whisper-cpp tiny`). e5-large CPU ≈ 2.5 GB, мониторим через `/api/ready`.
- **Anthropic geo-block RU** → fallback `CLAUDE_TRANSPORT=api+proxy` через `socks5h://<PROXY_HOST>:1080` (Xray на VPN-сервере). Релей **не OAuth-прокси**, только сетевой обход.
- **Нет аналитики/телеметрии** третьим лицам. Логи структурированные pino → файл, audit_log → Postgres, всё на сервере владельца.
- **Anti-hallucination**: только post-pass verifier. Сам Claude инструктирован цитировать **только подтверждённые tools'ом** статьи.

---

## 8. Интеграции

| Интеграция | Назначение | Auth | Failure mode |
|---|---|---|---|
| **Anthropic API** (`@anthropic-ai/sdk`) | LLM streaming + tool-use | API key (`ANTHROPIC_API_KEY`) | retry 3x exponential, circuit breaker; fallback `api+proxy` через Xray |
| **pravo.gov.ru** (`/proxy/ips/?searchlaw`) | Поиск действующих НПА РФ | — (public) | JSON → HTML scrape → SearXNG fallback |
| **sudact.ru** | Суд. практика общей юрисдикции | — | rate 1 req/s, 6h cache |
| **kad.arbitr.ru** | Арбитражная практика | — | Playwright sidecar (DDoS-Guard); circuit breaker → degradation на sudact.ru only |
| **SearXNG** (`http://127.0.0.1:8888`) | Web search self-host | local-only | если выключен — Claude получит error, продолжит без web |
| **OpenAI Whisper API** | Speech-to-Text | API key (`OPENAI_API_KEY`) | если key пуст — fallback `whisper-cpp tiny` |
| **Tesseract** (binary) | OCR русских сканов | — | устанвлен на VPS, `-l rus+eng` |
| **pdftotext / pdftoppm** (poppler) | PDF → text/image | — | устанвлены на VPS |
| **ffmpeg** | webm/opus → 16kHz mono WAV для Whisper | — | устанвлен на VPS |
| **PostgreSQL 14 + pgvector + pg_trgm** | Storage + RAG | local user `danilurist` | уже работает на loopback :5432 |

---

## 9. Критерии успеха

| Метрика | Цель | Метод измерения |
|---|---|---|
| Daily Active User | **1/1** (юрист) каждый рабочий день в течение 4 недель после запуска | self-report + `audit_log` записи с `created_at >= today` |
| Экономия времени | **≥ 2 ч / день** | self-report (юрист в дневнике сравнивает вручную) |
| Точность цитат | **≥ 95 %** ссылок на ст. НПА верифицированы через `tool_call_log` | citation verifier post-pass: % unverified < 5 % |
| Экспорт DOCX | **100 %** assistant-сообщений конвертируются без crash | `/api/export/docx` 200 OK, файл валиден (открывается в Word без errors) |
| OCR success rate | **≥ 90 %** загруженных PDF/JPG/PNG получают `ocr_status='done'` | `SELECT COUNT(*) FILTER (WHERE ocr_status='done') / COUNT(*) FROM files` |
| SSE latency p95 | **< 2 сек** до первого chunk | pino log `latency_ms` поле, агрегация по audit_log |
| Uptime | **≥ 99 %** за 30 дней | nginx access.log, `/api/health`/`/api/ready` мониторинг |

---

## 10. Cross-references

- **Архитектура и решения** → [DESIGN_DOC.md](./DESIGN_DOC.md)
  - §2 — Key Architectural Decisions (10+ ADR-стиль решений)
  - §6 — полная DDL схема БД
  - §7 — описание 9 tools
- **Атомарная декомпозиция файлов** → [PBS_ATOMIC.md](./PBS_ATOMIC.md)
  - 13 разделов от инфраструктуры до deploy
- **Полные TS-типы** → [INTERFACES.md](./INTERFACES.md)
- **Дорожная карта (фазы и milestone'ы)** → [ROADMAP.md](./ROADMAP.md)
- **Лог изменений** → [CHANGELOG.md](./CHANGELOG.md)
