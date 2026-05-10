/**
 * ULID — 26-символьный идентификатор Crockford Base32, сортируемый по времени.
 * Используется как primary key во всех таблицах. Brand-тип защищает от подмены
 * на произвольную строку без явного приведения через {@link asUlid}.
 */
declare const ULID_BRAND: unique symbol;
export type ULID = string & { readonly [ULID_BRAND]: true };

/** Регекс для валидации ULID (Crockford Base32, исключая I, L, O, U). */
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: unknown): value is ULID {
  return typeof value === "string" && ULID_REGEX.test(value);
}

/**
 * Безопасное приведение строки к ULID. Бросает если значение не соответствует формату.
 */
export function asUlid(value: string): ULID {
  if (!isUlid(value)) throw new TypeError(`Invalid ULID: ${value}`);
  return value as ULID;
}
