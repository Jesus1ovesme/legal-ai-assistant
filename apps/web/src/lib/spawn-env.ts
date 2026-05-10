/**
 * Готовит env для spawn'а Claude CLI (или иного дочернего процесса), вычищая
 * серверные секреты, которые ребёнку не нужны и могут утечь через MCP-tool /
 * stderr / model-output / claude-доступный shell.
 *
 * Что убираем:
 * - DATABASE_URL          (web-only, child спавнится в cwd папки и не использует БД)
 * - SESSION_PASSWORD      (iron-session — только web-side)
 * - APP_ACCESS_KEY        (auth-секрет)
 * - GARANT_API_TOKEN      (web-side proxy для legal-mcp)
 * - BUDGET_*              (только для UsageBar)
 * - BOOTSTRAP_PASSWORD    (legacy, на всякий)
 * - DOTENV_*              (системные)
 *
 * Что оставляем (минимум):
 * - PATH, HOME, USER, LANG, LC_*, TERM, NODE_ENV
 * - CLAUDE_*                          (нужно claude CLI)
 * - ANTHROPIC_*                       (API key для claude — он сам читает)
 */

const SECRET_KEY_PREFIXES = ["DATABASE_", "SESSION_", "BOOTSTRAP_", "DOTENV_"];
const SECRET_KEY_EXACT = new Set([
  "APP_ACCESS_KEY",
  "GARANT_API_TOKEN",
  "BUDGET_DAY_USD",
  "BUDGET_WEEK_USD",
  "RU_PROXY_URL",
]);

export function scrubEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SECRET_KEY_EXACT.has(k)) continue;
    if (SECRET_KEY_PREFIXES.some((p) => k.startsWith(p))) continue;
    out[k] = v;
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) out[k] = v;
  }
  // ProcessEnv требует NODE_ENV; в проде он есть, в build-time TS его не видит.
  // Cast безопасен — process.env.NODE_ENV всегда определён в Node runtime.
  return out as unknown as NodeJS.ProcessEnv;
}
