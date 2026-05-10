import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";

const CSRF_COOKIE = "csrf";

/** Генерация или re-use CSRF-токена. Hex 32 байта. NOT httpOnly — клиент должен прочитать. */
export async function getOrSetCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing && existing.length === 64) return existing;
  const token = randomBytes(32).toString("hex");
  jar.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return token;
}

/**
 * Проверка double-submit: клиент должен прислать `x-csrf-token` header == cookie `csrf`.
 * Использует timingSafeEqual для защиты от timing-атаки.
 */
export async function verifyCsrf(headerToken: string | null): Promise<boolean> {
  if (!headerToken) return false;
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  if (!cookieToken || cookieToken.length !== headerToken.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  } catch {
    return false;
  }
}

export { CSRF_COOKIE };
