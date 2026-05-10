import { NextResponse } from "next/server";
import { loadAllCaseTypes } from "@/lib/case-types/loader";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

/** GET /api/case-types → список всех 9 типов дел для UI выбора. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;
  const types = loadAllCaseTypes();
  // Не отдаём system_prompt (большой) — только мета-данные для UI.
  return NextResponse.json({
    types: types.map((t) => ({
      key: t.key,
      name_ru: t.name_ru,
      description: t.description,
      document_checklist: t.document_checklist,
    })),
  });
}
