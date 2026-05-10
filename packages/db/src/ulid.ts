import { ulid as generateUlid } from "ulid";
import { asUlid, type ULID } from "@danilurist/types";

/** Генерация нового ULID. Сортируется по времени (первые 10 символов = timestamp ms). */
export function newUlid(): ULID {
  return asUlid(generateUlid());
}
