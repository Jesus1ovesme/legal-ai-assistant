/**
 * Zod-валидация process.env на boot. Падает с детальной ошибкой, если критичная
 * переменная отсутствует или не соответствует формату.
 *
 * Используется один раз в instrumentation.ts на старте процесса.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url(),
  APP_PORT: z.coerce.number().int().positive().default(3010),
  APP_HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(20),
  SESSION_PASSWORD: z.string().min(32, "SESSION_PASSWORD must be at least 32 chars"),
  APP_ACCESS_KEY: z.string().min(16, "APP_ACCESS_KEY must be at least 16 chars"),

  CLAUDE_TRANSPORT: z.enum(["api", "api+proxy", "relay"]).default("api"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  CLAUDE_DEFAULT_MODEL: z.string().default("claude-opus-4-7"),
  CLAUDE_DEFAULT_EFFORT: z.enum(["low", "medium", "high", "max"]).default("max"),
  CLAUDE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  CLAUDE_MAX_TOKENS: z.coerce.number().int().positive().default(8192),
  CLAUDE_OUTBOUND_PROXY: z.string().optional().default(""),
  CLAUDE_RELAY_URL: z.string().optional().default(""),
  CLAUDE_RELAY_TOKEN: z.string().optional().default(""),

  EMBEDDING_PROVIDER: z.enum(["e5-local", "openai", "yandex"]).default("e5-local"),
  EMBEDDING_MODEL: z.string().default("intfloat/multilingual-e5-large"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),
  OPENAI_API_KEY: z.string().optional().default(""),

  STT_PROVIDER: z.enum(["openai-api", "whisper-cpp"]).default("openai-api"),
  WHISPER_CPP_BIN: z.string().optional().default(""),
  WHISPER_CPP_MODEL: z.string().optional().default(""),

  SEARXNG_URL: z.string().url().default("http://127.0.0.1:8888"),

  UPLOADS_ROOT: z.string().default("./uploads"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(52_428_800),
  MAX_FILES_PER_REQUEST: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),

  KAD_SIDECAR_URL: z.string().url().default("http://127.0.0.1:7711"),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.entries(flat.fieldErrors)
      .map(([key, errs]) => `  - ${key}: ${(errs ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${fieldErrors}`);
  }
  _env = parsed.data;
  return _env;
}
