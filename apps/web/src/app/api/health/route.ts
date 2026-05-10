import { NextResponse } from "next/server";

/** Liveness probe — отвечает 200 если процесс жив. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
