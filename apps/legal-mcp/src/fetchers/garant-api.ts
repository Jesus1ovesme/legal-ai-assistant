/**
 * Гарант Коннект API (api.garant.ru) — официальный платный API.
 *
 * Документация: https://www.garant.ru/mobileonline/api/documentation/
 *
 * Auth: OAuth Bearer token, выдаётся обслуживающей организацией Гаранта.
 *   GARANT_API_TOKEN в .env. Если не задан — graceful fallback (functions
 *   throw 'no_token', server отдаёт user-friendly сообщение).
 *
 * Endpoints используем:
 *   POST /v2/search          — полнотекстовый поиск по комплекту
 *   GET  /v2/topic/{id}      — текст документа (HTML)
 *   GET  /v2/topic/{id}/download-pdf — PDF
 *   GET  /v2/redactions/{id} — редакции документа
 */

const BASE = "https://api.garant.ru";

function getToken(): string | null {
  const t = process.env.GARANT_API_TOKEN?.trim();
  if (!t) return null;
  return t;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("no_token");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export interface GarantSearchResult {
  topicId: number;
  title: string;
  type: string | null;
  date: string | null;
  number: string | null;
  snippet: string | null;
}

interface RawSearchResponse {
  documents?: Array<{
    topic?: number;
    title?: string;
    type?: string;
    date?: string;
    number?: string;
    snippet?: string;
  }>;
  count?: number;
}

/**
 * Поиск по Гаранту. POST /v2/search с JSON body.
 *
 * Если нет токена — throw 'no_token'. UI выдаёт fallback URL.
 */
export async function garantSearch(
  query: string,
  opts: { page?: number; limit?: number } = {},
): Promise<GarantSearchResult[]> {
  const headers = authHeaders();
  const body = {
    query,
    isQuery: true,
    page: opts.page ?? 1,
  };
  const res = await fetch(`${BASE}/v2/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("token_invalid_or_expired");
    if (res.status === 403) throw new Error("token_no_rights");
    if (res.status === 429) throw new Error("rate_limited");
    throw new Error(`garant http ${res.status}`);
  }
  const data = (await res.json()) as RawSearchResponse;
  const docs = data.documents ?? [];
  const limit = Math.min(opts.limit ?? 10, 30);
  return docs.slice(0, limit).map((d) => ({
    topicId: Number(d.topic ?? 0),
    title: String(d.title ?? "").trim(),
    type: d.type ?? null,
    date: d.date ?? null,
    number: d.number ?? null,
    snippet: d.snippet ? String(d.snippet).slice(0, 300) : null,
  }));
}

/**
 * Получить текст документа Гарант по topic id (HTML → возвращаем как plain text).
 */
export async function garantFetchDoc(topicId: number): Promise<{ title: string; html: string }> {
  const headers = authHeaders();
  delete headers["Content-Type"];
  const res = await fetch(`${BASE}/v2/topic/${topicId}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("token_invalid_or_expired");
    if (res.status === 404) throw new Error("topic_not_found");
    throw new Error(`garant http ${res.status}`);
  }
  const data = (await res.json()) as { title?: string; html?: string };
  return {
    title: String(data.title ?? "").trim(),
    html: String(data.html ?? "").trim(),
  };
}

export function hasToken(): boolean {
  return getToken() !== null;
}
