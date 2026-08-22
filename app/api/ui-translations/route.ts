import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getUiTranslations, isSupportedLanguage } from "../../../lib/translate";
import { REPORT_UI_STRINGS } from "../../../lib/uiStrings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the translated UI-chrome dictionary for a language, for client
// components (portals) that apply it via UiAutoTranslate. Cached globally, so
// this is cheap after the first call per language. No auth needed — the labels
// are non-sensitive UI strings.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const explicit = String(params.get("lang") || "").trim().toLowerCase();
  const inspectionId = params.get("inspectionId");

  try {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Resolve the language: an explicit lang wins; otherwise fall back to the
    // company's default report language for the given inspection.
    let lang = explicit;
    if (!lang && inspectionId) {
      const { data: insp } = await admin
        .from("inspections")
        .select("company_id")
        .eq("id", inspectionId)
        .maybeSingle();
      if ((insp as any)?.company_id) {
        const { data: co } = await admin
          .from("companies")
          .select("preferred_language")
          .eq("id", (insp as any).company_id)
          .maybeSingle();
        lang = String((co as any)?.preferred_language || "").trim().toLowerCase();
      }
    }

    if (!lang || lang === "en" || !isSupportedLanguage(lang)) {
      return NextResponse.json({ lang: "en", map: {} });
    }

    const map = await getUiTranslations(admin, lang, REPORT_UI_STRINGS);
    return NextResponse.json({ lang, map });
  } catch {
    return NextResponse.json({ lang: "en", map: {} });
  }
}
