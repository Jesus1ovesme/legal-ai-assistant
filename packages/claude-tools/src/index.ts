/**
 * @danilurist/claude-tools — 9 read-only инструментов для AI-чата.
 *
 * **Реализация Phase 3-4** (см. ROADMAP.md). Каждый tool:
 *   - JSON-schema input для Anthropic Tools API,
 *   - server-side handler с инжекцией ctx (folderId не из tool input — из сервера),
 *   - кэш (npa_search_cache / npa_doc_cache / court_search_cache),
 *   - rate-limit + circuit breaker.
 *
 * Список инструментов (имена для tool registry):
 *   1. search_npa                — pravo.gov.ru (24h cache)
 *   2. fetch_npa_document        — НПА полным текстом (7d cache)
 *   3. search_court_practice     — sudact + kad.arbitr (best-effort)
 *   4. web_search                — SearXNG self-host
 *   5. fetch_web_page            — HTML/PDF (SSRF guard)
 *   6. read_file_in_folder       — file из текущей папки (folder_id из ctx)
 *   7. list_folder_contents      — manifest активной папки
 *   8. semantic_search_in_folder — pgvector cosine, filter folder_id
 *   9. cross_folder_search       — RAG в другой папке (только при @mention)
 */

export const TOOL_NAMES = [
  "search_npa",
  "fetch_npa_document",
  "search_court_practice",
  "web_search",
  "fetch_web_page",
  "read_file_in_folder",
  "list_folder_contents",
  "semantic_search_in_folder",
  "cross_folder_search",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
