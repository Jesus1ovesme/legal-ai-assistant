import { NextResponse } from "next/server";
import { getSession, type SessionData } from "./session";

export interface AuthedSession {
  userId: string;
  email: string;
  raw: SessionData;
}

/**
 * Хелпер для API-routes: возвращает либо успешную сессию, либо 401 Response.
 * Используй: `const auth = await requireSession(); if (auth instanceof Response) return auth;`
 */
export async function requireSession(): Promise<AuthedSession | Response> {
  const session = await getSession();
  if (!session.userId || !session.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { userId: session.userId, email: session.email, raw: session };
}
