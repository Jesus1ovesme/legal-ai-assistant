import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { getEnv } from "../env";

/** Что хранится в encrypted cookie. Минимум — id юзера и время выдачи. */
export interface SessionData {
  userId?: string;
  email?: string;
  /** Unix ms — момент выдачи. Используется для отображения в UI и для rolling-renewal. */
  issuedAt?: number;
}

const SESSION_COOKIE_NAME = "danilurist_session";

/** Ленивое формирование SessionOptions, чтобы env читался уже в runtime. */
function getSessionOptions(): SessionOptions {
  const env = getEnv();
  return {
    password: env.SESSION_PASSWORD,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 14, // 14 дней
    },
  };
}

/** Получить сессию из текущего request (Server Component / Route Handler / Server Action). */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export { SESSION_COOKIE_NAME };
