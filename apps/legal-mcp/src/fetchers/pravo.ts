import * as cheerio from "cheerio";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { SocksProxyAgent } from "socks-proxy-agent";

export interface NpaResult {
  url: string;
  title: string;
  publishNumber: string | null;
  publishDate: string | null;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/**
 * GET через optional SOCKS proxy. publication.pravo.gov.ru блокирует не-RU IP,
 * RU_PROXY_URL пробрасывает в Москву.
 */
function fetchViaProxy(targetUrl: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const proxy = process.env.RU_PROXY_URL;
    const url = new URL(targetUrl);
    const isHttps = url.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const opts: any = {
      method: "GET",
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru,en;q=0.9",
        Host: url.hostname,
      },
      timeout: timeoutMs,
    };
    if (proxy) {
      opts.agent = new SocksProxyAgent(proxy);
    }

    const req = reqFn(opts, (res) => {
      // Обработка redirect (3xx → следуем 1 раз).
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, targetUrl).toString();
        res.resume();
        fetchViaProxy(redirectUrl, timeoutMs).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({ status, body: Buffer.concat(chunks).toString("utf8") });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`request timeout (${timeoutMs}ms)`));
    });
    req.end();
  });
}

const BASES = ["https://publication.pravo.gov.ru", "http://publication.pravo.gov.ru"];

export async function searchNpa(
  query: string,
  opts: { limit?: number } = {},
): Promise<NpaResult[]> {
  const limit = Math.min(opts.limit ?? 10, 30);
  let html = "";
  let lastError: Error | null = null;
  for (const base of BASES) {
    try {
      const url = `${base}/search?text=${encodeURIComponent(query)}`;
      const { status, body } = await fetchViaProxy(url, 25_000);
      if (status === 200 && body) {
        html = body;
        break;
      }
      lastError = new Error(`pravo.gov.ru http ${status}`);
    } catch (err) {
      lastError = err as Error;
    }
  }
  if (!html) {
    throw lastError ?? new Error("pravo.gov.ru unavailable");
  }

  const $ = cheerio.load(html);
  const results: NpaResult[] = [];
  $("a.documents-item-name").each((_, el) => {
    if (results.length >= limit) return;
    const a = $(el);
    const href = a.attr("href") ?? "";
    if (!href || !href.startsWith("/document/")) return;
    const title = a.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const wrapper = a.closest(".documents-items").first();
    const publishNumber = wrapper.find(".info-data").first().text().trim() || null;
    const publishDate =
      wrapper
        .find(".info-data")
        .filter((__, e) => /^\d{2}\.\d{2}\.\d{4}$/.test($(e).text().trim()))
        .first()
        .text()
        .trim() || null;

    if (results.some((r) => r.url.endsWith(href))) return;

    results.push({
      url: `https://publication.pravo.gov.ru${href}`,
      title,
      publishNumber,
      publishDate,
    });
  });

  return results;
}
