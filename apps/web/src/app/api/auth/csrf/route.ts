import { NextResponse } from "next/server";
import { getOrSetCsrfToken } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";

/** GET /api/auth/csrf → { token }. Также set-cookie csrf (читаемый JS). */
export async function GET() {
  const token = await getOrSetCsrfToken();
  return NextResponse.json({ token });
}
