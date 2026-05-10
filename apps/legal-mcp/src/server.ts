#!/usr/bin/env node
/**
 * Legal MCP Server — экспозит юр-tools для Claude Code TUI.
 *
 * Tools:
 *   - legal__search_court_practice(query, limit?)
 *   - legal__fetch_court_doc(url)
 *
 * Запускается claude'ом per-session через stdio, см. .mcp.json в корне репо.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { searchCourt, fetchCourtDoc } from "./fetchers/sudact.js";
import {
  searchLegalCorpus,
  consultantUrl,
  garantSearchUrl,
  pravoSearchUrl,
  parseCitation,
} from "./legal-corpus.js";
import { searchNpa } from "./fetchers/pravo.js";
import { garantSearch, garantFetchDoc, hasToken as hasGarantToken } from "./fetchers/garant-api.js";
import {
  hashQuery,
  readCourtCache,
  writeCourtCache,
  readDocCache,
  writeDocCache,
  readNpaCache,
  writeNpaCache,
} from "./cache.js";

const server = new Server(
  { name: "legal", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_court_practice",
      description:
        "Поиск судебной практики РФ через sudact.ru (~50M актов общей юрисдикции). Возвращает список найденных решений с заголовком, судом, категорией и URL. Используй для поиска прецедентов перед составлением иска или отзыва. Кэш 24 часа.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Поисковая строка на русском. Пример: 'защита чести достоинства публичных лиц 2024' или 'ст 1064 ГК ущерб ДТП'",
          },
          limit: {
            type: "number",
            description: "Сколько результатов вернуть (макс 30, по умолчанию 10)",
            default: 10,
          },
        },
        required: ["query"],
      },
    },
    {
      name: "find_law",
      description:
        "Найти основной НПА (кодекс или ФЗ) по короткому имени или ключевым словам. Возвращает заголовок + URL на consultant.ru. Используй ПЕРЕД WebFetch чтобы получить точный URL документа. Покрывает все 17 кодексов РФ + 10+ ключевых ФЗ + важные ППВС. Локальная таблица, без сети, мгновенно.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Короткое имя или ключевые слова. Пример: 'ГК', 'УК РФ', 'ОСАГО', 'защита прав потребителей', 'банкротство', 'наследство', 'ППВС честь и достоинство'",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "search_npa",
      description:
        "Поиск свежих НПА в publication.pravo.gov.ru (официальный портал публикации). Подходит для свежих ФЗ, указов, постановлений. Идёт через RU proxy. Кэш 7 дней.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковая строка (рус)" },
          limit: { type: "number", description: "Макс результатов (1-30)", default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "garant_search",
      description:
        "Поиск НПА через официальный Гарант Коннект API (api.garant.ru). Требует GARANT_API_TOKEN в env (платная подписка Гаранта). Если токен есть — точный поиск с метаданными. Если нет — возвращает search URL для перехода вручную.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковая строка" },
          limit: { type: "number", default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "garant_fetch_doc",
      description:
        "Получить текст документа Гаранта по topic ID. Требует GARANT_API_TOKEN. Используется ПОСЛЕ garant_search чтобы прочитать конкретный акт.",
      inputSchema: {
        type: "object",
        properties: {
          topicId: { type: "number", description: "Garant topic id" },
        },
        required: ["topicId"],
      },
    },
    {
      name: "case_timeline",
      description:
        "Извлечь хронологию событий из текста (фабула, материалы дела). Парсит даты в любом формате (12.05.2024, 12 мая 2024, 2024-05-12) + ближайший контекст события. Возвращает Markdown-таблицу. Используй после чтения файлов клиента, чтобы построить timeline дела для иска.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Произвольный текст с упоминаниями дат и событий (max 100K символов).",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "validate_citation",
      description:
        "Проверить цитату НПА вида 'ст. 152 ГК РФ' или 'п.2 ст. 1064 ГК'. Парсит номер статьи/пункта, ищет в локальной таблице, возвращает URL для проверки текста через WebFetch. Используй ПЕРЕД тем как вставить цитату в исковое заявление, чтобы не выдумать номер.",
      inputSchema: {
        type: "object",
        properties: {
          citation: {
            type: "string",
            description: "Текст цитаты, как принято в юр-документах. Пример: 'ст. 152 ГК РФ', 'п. 2 ст. 1064 ГК', 'ч. 1 ст. 14 ФЗ-40 ОСАГО'",
          },
        },
        required: ["citation"],
      },
    },
    {
      name: "fetch_court_doc",
      description:
        "Получить полный текст судебного решения по URL с sudact.ru. Возвращает h1 + основной текст до ~10K символов. Используй после search_court_practice для углублённого анализа конкретного решения.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Полный URL вида https://sudact.ru/regular/doc/<ID>/",
          },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "search_court_practice") {
      const query = String((args as { query?: unknown })?.query ?? "").trim();
      const limit = Math.min(Math.max(Number((args as { limit?: unknown })?.limit) || 10, 1), 30);
      if (!query) throw new Error("query is required");

      const hash = hashQuery({ kind: "court_search", query: query.toLowerCase(), limit });
      let results = await readCourtCache<Awaited<ReturnType<typeof searchCourt>>>(hash);
      let cached = true;
      if (!results) {
        results = await searchCourt(query, { limit });
        await writeCourtCache(hash, results);
        cached = false;
      }
      return {
        content: [
          {
            type: "text",
            text:
              renderCourtSearchMarkdown(query, results) +
              `\n\n_${cached ? "из кэша" : "свежий поиск"}, ${results.length} результатов_`,
          },
        ],
      };
    }

    if (name === "find_law") {
      const query = String((args as { query?: unknown })?.query ?? "").trim();
      if (!query) throw new Error("query is required");

      const hits = searchLegalCorpus(query, 10);
      const lines: string[] = [];
      if (hits.length === 0) {
        lines.push(`# Поиск НПА: "${query}"\n`);
        lines.push("В локальной таблице 30+ ключевых актов ничего не найдено.\n");
        lines.push("**Что делать дальше:**");
        lines.push("1. Попробуй другой синоним (например 'ГК' вместо 'гражданский кодекс')");
        lines.push("2. Используй WebFetch напрямую на:");
        lines.push(`   - \`https://www.consultant.ru/search/?q=${encodeURIComponent(query)}\``);
        lines.push(`   - \`https://base.garant.ru/search/?text=${encodeURIComponent(query)}\``);
        lines.push(`   - \`https://publication.pravo.gov.ru/search?text=${encodeURIComponent(query)}\``);
        lines.push("3. WebSearch `${query} site:consultant.ru` для discovery свежих ФЗ");
      } else {
        lines.push(`# НПА по запросу: "${query}"`, "");
        hits.forEach((act, i) => {
          lines.push(`${i + 1}. **${act.shortName}** — ${act.title}`);
          if (act.description) lines.push(`   _${act.description}_`);
          lines.push(`   - КонсультантПлюс: ${consultantUrl(act.id)}`);
          lines.push(`   - ГАРАНТ (cross-verify): ${garantSearchUrl(act.shortName)}`);
          lines.push("");
        });
        lines.push("---");
        lines.push("**Дальше**: WebFetch на КонсультантПлюс URL для текста статьи. Если нужна вторая проверка — открой ГАРАНТ ссылку.");
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }

    if (name === "search_npa") {
      const query = String((args as { query?: unknown })?.query ?? "").trim();
      const limit = Math.min(Math.max(Number((args as { limit?: unknown })?.limit) || 10, 1), 30);
      if (!query) throw new Error("query is required");

      const hash = hashQuery({ kind: "npa_search", query: query.toLowerCase(), limit });
      let results = await readNpaCache<Awaited<ReturnType<typeof searchNpa>>>(hash);
      let cached = true;
      if (!results) {
        results = await searchNpa(query, { limit });
        await writeNpaCache(hash, results);
        cached = false;
      }
      const lines: string[] = results.length === 0
        ? [`# Поиск НПА: "${query}"`, "", "На publication.pravo.gov.ru ничего не найдено."]
        : [`# НПА с pravo.gov.ru: "${query}"`, ""];
      results.forEach((r, i) => {
        lines.push(`${i + 1}. **${r.title}**`);
        const meta: string[] = [];
        if (r.publishNumber) meta.push(`№ опубл. ${r.publishNumber}`);
        if (r.publishDate) meta.push(r.publishDate);
        if (meta.length) lines.push(`   ${meta.join(" · ")}`);
        lines.push(`   ${r.url}`);
        lines.push("");
      });
      lines.push(`_${cached ? "из кэша" : "свежий поиск"}, ${results.length} результатов_`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "garant_search") {
      const query = String((args as { query?: unknown })?.query ?? "").trim();
      const limit = Math.min(Math.max(Number((args as { limit?: unknown })?.limit) || 10, 1), 30);
      if (!query) throw new Error("query is required");

      if (!hasGarantToken()) {
        return {
          content: [{
            type: "text",
            text: `# Гарант (без токена)\n\nGARANT_API_TOKEN не задан в .env. Поиск через API недоступен.\n\nДля перехода вручную: ${garantSearchUrl(query)}\n\n_Чтобы включить точный поиск через Гарант Коннект API — оформи подписку Гаранта (от ~3-5K USD/год) и пропиши токен в \`.env\` как \`GARANT_API_TOKEN=...\`._`,
          }],
        };
      }

      const results = await garantSearch(query, { limit });
      if (results.length === 0) {
        return { content: [{ type: "text", text: `# Гарант: "${query}"\n\nНичего не найдено.` }] };
      }
      const lines: string[] = [`# Гарант: "${query}"`, ""];
      results.forEach((r, i) => {
        lines.push(`${i + 1}. **${r.title}**`);
        const meta: string[] = [];
        if (r.type) meta.push(r.type);
        if (r.number) meta.push(`№ ${r.number}`);
        if (r.date) meta.push(r.date);
        if (meta.length) lines.push(`   ${meta.join(" · ")}`);
        if (r.snippet) lines.push(`   _${r.snippet}_`);
        lines.push(`   topic_id: \`${r.topicId}\` (для garant_fetch_doc)`);
        lines.push("");
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "garant_fetch_doc") {
      const topicId = Number((args as { topicId?: unknown })?.topicId);
      if (!topicId) throw new Error("topicId is required");
      if (!hasGarantToken()) {
        return {
          content: [{ type: "text", text: "GARANT_API_TOKEN не задан. Используй consultant.ru через WebFetch." }],
        };
      }
      const doc = await garantFetchDoc(topicId);
      // HTML → plain text (минимально)
      const text = doc.html
        .replace(/<script[^>]*>.*?<\/script>/gs, "")
        .replace(/<style[^>]*>.*?<\/style>/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const truncated = text.length > 12_000 ? text.slice(0, 12_000) + "\n\n…[обрезано]" : text;
      return {
        content: [{ type: "text", text: `# ${doc.title}\n\n${truncated}\n\n_Источник: Гарант Коннект API · topic ${topicId}_` }],
      };
    }

    if (name === "case_timeline") {
      const text = String((args as { text?: unknown })?.text ?? "");
      if (!text.trim()) throw new Error("text is required");
      if (text.length > 100_000) throw new Error("text too long (>100K)");
      const events = extractTimeline(text);
      return { content: [{ type: "text", text: renderTimelineMarkdown(events) }] };
    }

    if (name === "validate_citation") {
      const citation = String((args as { citation?: unknown })?.citation ?? "").trim();
      if (!citation) throw new Error("citation is required");
      const parsed = parseCitation(citation);

      const lines: string[] = [`# Проверка цитаты: "${citation}"`, ""];
      if (parsed.matched) {
        lines.push(`✅ **Найдено в локальной таблице**`);
        lines.push(`- НПА: **${parsed.matched.shortName}** — ${parsed.matched.title}`);
        if (parsed.article) lines.push(`- Статья: ${parsed.article}`);
        if (parsed.paragraph) lines.push(`- Пункт/часть: ${parsed.paragraph}`);
        lines.push(`- URL: ${consultantUrl(parsed.matched.id)}`);
        lines.push("");
        lines.push("**Дальше**: вызови WebFetch на URL выше + якорь #ст-N или поищи в тексте по 'Статья N' для проверки точной формулировки. Только после успешной проверки — вставляй цитату в документ.");
      } else {
        lines.push(`⚠️ **НПА не найден в локальной таблице 56 ключевых актов**`);
        if (parsed.lawHint) lines.push(`Распознано: \`${parsed.lawHint}\``);
        if (parsed.article) lines.push(`Статья: ${parsed.article}`);
        if (parsed.paragraph) lines.push(`Пункт/часть: ${parsed.paragraph}`);
        lines.push("");
        lines.push("**Действия:**");
        lines.push("1. Вызови `find_law` с уточнённым именем — может быть синоним");
        lines.push(`2. \`WebSearch <law>\` для discovery редкого ФЗ`);
        lines.push("3. **Не вставляй цитату** пока не подтвердил источник через WebFetch");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "fetch_court_doc") {
      const url = String((args as { url?: unknown })?.url ?? "").trim();
      if (!url) throw new Error("url is required");

      const hash = hashQuery({ kind: "court_doc", url });
      let cached = await readDocCache(hash);
      let fromCache = true;
      if (!cached) {
        const doc = await fetchCourtDoc(url);
        await writeDocCache(hash, url, doc.title, doc.body);
        cached = { title: doc.title, fullTextMd: doc.body };
        fromCache = false;
      }
      return {
        content: [
          {
            type: "text",
            text:
              `# ${cached.title}\n\n${cached.fullTextMd}\n\n---\n_Источник: ${url}${fromCache ? " · из кэша" : ""}_`,
          },
        ],
      };
    }

    throw new Error(`unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Ошибка ${name}: ${(err as Error).message}`,
        },
      ],
    };
  }
});

interface TimelineEvent {
  iso: string; // YYYY-MM-DD
  raw: string;
  context: string;
}

const RU_MONTH: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

function extractTimeline(text: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  // 1. dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
  const numericRe = /(\b\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}\b)/g;
  // 2. yyyy-mm-dd
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  // 3. dd <месяц> yyyy
  const ruRe = /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+|\sг\.?\s)(\d{4})/giu;

  const seen = new Set<string>();
  const push = (iso: string, matchStart: number, matchEnd: number, raw: string) => {
    const key = `${iso}@${matchStart}`;
    if (seen.has(key)) return;
    seen.add(key);
    // ±100 символов вокруг для контекста
    const ctxStart = Math.max(0, matchStart - 80);
    const ctxEnd = Math.min(text.length, matchEnd + 80);
    let context = text
      .slice(ctxStart, ctxEnd)
      .replace(/\s+/g, " ")
      .trim();
    // Удалим саму дату из контекста чтобы не дублировать
    context = context.replace(raw, "…").trim();
    events.push({ iso, raw, context });
  };

  let m: RegExpExecArray | null;
  while ((m = numericRe.exec(text))) {
    const d = +m[1]!, mo = +m[2]!, y = +m[3]!;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    if (y < 1900 || y > 2100) continue;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    push(iso, m.index, m.index + m[0].length, m[0]);
  }
  while ((m = isoRe.exec(text))) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    push(iso, m.index, m.index + m[0].length, m[0]);
  }
  while ((m = ruRe.exec(text))) {
    const d = +m[1]!;
    const mo = RU_MONTH[m[2]!.toLowerCase()];
    const y = +m[3]!;
    if (!mo || d < 1 || d > 31 || y < 1900 || y > 2100) continue;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    push(iso, m.index, m.index + m[0].length, m[0]);
  }

  return events.sort((a, b) => a.iso.localeCompare(b.iso));
}

function renderTimelineMarkdown(events: TimelineEvent[]): string {
  if (events.length === 0) {
    return "# Хронология\n\nДат в тексте не найдено.";
  }
  const lines: string[] = [
    "# Хронология событий",
    "",
    `Найдено **${events.length}** дат(ы) в тексте.`,
    "",
    "| Дата | Что в тексте | Контекст |",
    "|---|---|---|",
  ];
  for (const e of events) {
    const ru = formatRuDate(e.iso);
    const cell = e.context.length > 120 ? e.context.slice(0, 120) + "…" : e.context;
    lines.push(`| ${ru} | \`${e.raw}\` | ${cell.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n");
}

function formatRuDate(iso: string): string {
  const [y, mo, d] = iso.split("-");
  const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${Number(d)} ${months[Number(mo) - 1] ?? mo} ${y}`;
}

function renderCourtSearchMarkdown(
  query: string,
  results: { url: string; title: string; court: string; category: string; caseDate: string | null }[],
): string {
  if (results.length === 0) {
    return `# Поиск судпрактики: "${query}"\n\nНичего не найдено. Попробуй другую формулировку.`;
  }
  const lines: string[] = [`# Судебная практика: "${query}"`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**`);
    lines.push(`   ${r.court}${r.category ? ` · ${r.category}` : ""}${r.caseDate ? ` · ${r.caseDate}` : ""}`);
    lines.push(`   ${r.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

// Stdio transport — claude code общается с нами через stdin/stdout JSON-RPC.
const transport = new StdioServerTransport();
await server.connect(transport);
// Логируем в stderr (stdout зарезервирован для протокола).
process.stderr.write("[legal-mcp] stdio server ready\n");
