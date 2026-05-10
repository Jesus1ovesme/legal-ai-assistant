import pino, { type Logger } from "pino";

let _logger: Logger | null = null;

/** Ленивая инициализация — не падаем на build-time, когда env-vars ещё не загружены. */
function getLogger(): Logger {
  if (_logger) return _logger;
  const level = process.env.LOG_LEVEL ?? "info";
  const format = process.env.LOG_FORMAT ?? "json";
  _logger = pino({
    level,
    ...(format === "pretty"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss.l" },
          },
        }
      : {}),
    base: { service: "danilurist-web" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // pino-redact: keys с дефисами/спецсимволами должны идти через bracket-notation
    // (`headers["set-cookie"]`), plain `set-cookie` парсится как нерабочий path и
    // pino выбросит ошибку при инициализации → 500 на каждый запрос с log.
    redact: {
      paths: [
        "password",
        "passwordHash",
        "password_hash",
        "key",
        "token",
        "secret",
        "*.password",
        "*.passwordHash",
        "*.password_hash",
        "*.key",
        "*.token",
        "*.secret",
        "*.apiKey",
        "*.apiToken",
        "Authorization",
        "authorization",
        "cookie",
        "Cookie",
        '*["set-cookie"]',
        '*["x-csrf-token"]',
        '*["x-real-ip"]',
        '*["x-forwarded-for"]',
        '*["authorization"]',
        '*["cookie"]',
        "*.Authorization",
        "*.cookie",
        "*.Cookie",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "SESSION_PASSWORD",
        "DATABASE_URL",
        "GARANT_API_TOKEN",
        "APP_ACCESS_KEY",
        "*.ANTHROPIC_API_KEY",
        "*.OPENAI_API_KEY",
        "*.SESSION_PASSWORD",
        "*.DATABASE_URL",
        "*.GARANT_API_TOKEN",
        "*.APP_ACCESS_KEY",
      ],
      censor: "[REDACTED]",
    },
  });
  return _logger;
}

/**
 * Прокси-объект, проксирующий все вызовы на ленивый pino-инстанс.
 * Использование `logger.info(...)` работает идентично pino, но первый импорт модуля
 * не падает при отсутствующих env-переменных.
 */
export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop) {
    return Reflect.get(getLogger(), prop);
  },
});
