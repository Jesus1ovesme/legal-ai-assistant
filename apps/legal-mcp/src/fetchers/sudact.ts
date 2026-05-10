import * as cheerio from "cheerio";

export interface CourtResult {
  url: string;
  title: string;
  court: string;
  category: string;
  caseDate: string | null;
}

const UA = "Mozilla/5.0 (compatible; DanilUrist-Legal-Bot/1.0; legal practice search)";

/**
 * Поиск судебной практики на sudact.ru.
 * URL: https://sudact.ru/regular/?regular-txt=<query> — отдаёт SSR HTML с результатами.
 * /regular/doc/?regular-txt=... через AJAX (Disallow в robots.txt) — НЕ используем.
 */
export async function searchCourt(
  query: string,
  opts: { limit?: number } = {},
): Promise<CourtResult[]> {
  const limit = Math.min(opts.limit ?? 10, 30);
  const url = `https://sudact.ru/regular/?regular-txt=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru,en;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`sudact http ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const results: CourtResult[] = [];
  $("h4 a[href^='/regular/doc/']").each((_, el) => {
    if (results.length >= limit) return;
    const a = $(el);
    const href = a.attr("href") ?? "";
    const title = a.text().trim();
    if (!href || !title) return;

    // .b-justice идёт после <h4>, в общем родителе (часто <li>)
    const li = a.closest("li");
    const justice = li.find(".b-justice").first().text().trim();

    // Из title извлекаем дату ("Решение от 21 марта 2026 г.")
    const dateMatch = title.match(
      /от\s+(\d{1,2}\s+\S+\s+\d{4})/i,
    );
    const caseDate = dateMatch ? dateMatch[1] ?? null : null;

    // .b-justice типичный формат: "Пушкинский районный суд (Город Санкт-Петербург) - Гражданское"
    const justiceParts = justice.split(/\s+-\s+/);
    const court = justiceParts[0]?.trim() ?? "";
    const category = justiceParts[1]?.trim() ?? "";

    results.push({
      url: `https://sudact.ru${href}`,
      title,
      court,
      category,
      caseDate,
    });
  });

  return results;
}

export interface CourtDoc {
  url: string;
  title: string;
  body: string; // первые ~10K символов основного текста (без HTML)
}

/**
 * Получить текст конкретного судебного решения с sudact.ru.
 * Выжимаем h1 + body content (без навигации/footer'а), обрезаем до 10K символов
 * чтобы не раздуть Claude context — для деталей юрист может WebFetch'ить full URL.
 */
export async function fetchCourtDoc(docUrl: string): Promise<CourtDoc> {
  if (!/^https:\/\/sudact\.ru\/regular\/doc\/[^/]+\/?$/.test(docUrl)) {
    throw new Error("invalid_sudact_url");
  }
  const res = await fetch(docUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`sudact http ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim();

  // Текст судебного решения находится в основном контенте между h1 и блоком
  // .main-info-qa (sidebar/related). Берём родительский контейнер и
  // извлекаем text с заменой <br> → \n.
  const main = $("h1").first().parent();
  // Удаляем рекламу и nav-элементы
  main.find("script, style, .footer_adv, .adv_inside_text, .main-info-qa, .form-reset-block").remove();

  let bodyText = main.text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (bodyText.length > 10000) bodyText = bodyText.slice(0, 10000) + "\n\n…[документ обрезан, full text по URL]";

  return { url: docUrl, title, body: bodyText };
}
