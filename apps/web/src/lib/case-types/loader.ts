import { readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { CaseTypeDefinitionSchema, CaseType, type CaseTypeDefinitionParsed } from "@legal-ai-assistant/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, "..", "..", "..", "config", "case-types");

interface CacheEntry {
  def: CaseTypeDefinitionParsed;
  mtimeMs: number;
}

const cache = new Map<CaseType, CacheEntry>();

function fileNameForKey(key: CaseType): string {
  return path.join(CONFIG_DIR, `${key.toLowerCase()}.yaml`);
}

/**
 * Загрузка case-type определения из YAML с in-process кэшем + invalidation по mtime.
 * При первом обращении читает с диска, парсит через zod-схему. Последующие запросы — из кэша,
 * пока mtime файла не изменился.
 */
export function loadCaseType(key: CaseType): CaseTypeDefinitionParsed {
  const filePath = fileNameForKey(key);
  const stat = statSync(filePath);
  const cached = cache.get(key);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.def;
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw);
  const result = CaseTypeDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid case-type YAML at ${filePath}:\n${JSON.stringify(result.error.flatten(), null, 2)}`,
    );
  }
  if (result.data.key !== key) {
    throw new Error(`Case-type key mismatch: file ${filePath} has key=${result.data.key}, expected ${key}`);
  }
  cache.set(key, { def: result.data, mtimeMs: stat.mtimeMs });
  return result.data;
}

/** Загрузка всех 9 типов сразу (для UI выбора при создании папки). */
export function loadAllCaseTypes(): CaseTypeDefinitionParsed[] {
  return Object.values(CaseType).map((key) => loadCaseType(key));
}
