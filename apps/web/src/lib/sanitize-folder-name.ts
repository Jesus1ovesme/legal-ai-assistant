/**
 * Чистит имя папки от:
 * - control chars (0x00-0x1F, 0x7F) — null-byte / VT / display-sabotage,
 * - перевода строки и табуляции — ломают sectioning system prompt'а
 *   (в chat/stream prompt построен через `Имя папки: ${name}` и юрист может
 *   случайно вставить multi-line text при копи-пасте, что обманет модель),
 * - двойных/хвостовых пробелов — косметика.
 *
 * Возвращает безопасное имя или null если после чистки осталась пустая строка.
 */
export function sanitizeFolderName(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  return cleaned;
}
