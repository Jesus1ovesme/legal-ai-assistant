import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TermSessions {
  sessions: Record<string, { active: boolean; clients: number; idleMs: number }>;
  count: number;
}

/**
 * GET /api/folders/status — статусы активности папок для индикаторов в FolderTree.
 *
 * Источник: term-server :3011/sessions (loopback) — какие PTY сейчас живы и
 * имеют ли подключённого клиента.
 *
 * Возвращает: { folderId: "running" | "idle" } — только активные.
 * Папки без активной PTY не возвращаются (UI трактует отсутствие как «нет статуса»).
 */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  // Опрос term-server по loopback. Дешёвый — он держит pool в памяти.
  let termData: TermSessions = { sessions: {}, count: 0 };
  try {
    const res = await fetch("http://127.0.0.1:3011/sessions", {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) termData = (await res.json()) as TermSessions;
  } catch {
    // term-server упал — индикаторы просто не покажутся, не критично
  }

  const statuses: Record<string, "running" | "idle"> = {};
  for (const [folderId, info] of Object.entries(termData.sessions)) {
    statuses[folderId] = info.active ? "running" : "idle";
  }

  return NextResponse.json({ statuses });
}
