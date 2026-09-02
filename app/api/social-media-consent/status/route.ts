import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionByToken } from "../../../../lib/socialMediaRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the no-login client surfaces (portal / report / agreement page) whether
// to show the social-media consent, the release text to display, and whether
// this client already answered. Resolves strictly by share token. Off on miss.

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(request: Request) {
  try {
    const db = admin();
    const { searchParams } = new URL(request.url);
    const lookup = String(searchParams.get("lookup") || "").trim();
    if (!lookup) return NextResponse.json({ enabled: false });

    const inspection = await resolveInspectionByToken(db, lookup);
    if (!inspection?.id) return NextResponse.json({ enabled: false });

    let enabled = false;
    let text = "";
    if (inspection.company_id) {
      const { data: company } = await db
        .from("companies")
        .select("social_media_release_enabled, social_media_release_text")
        .eq("id", inspection.company_id)
        .maybeSingle();
      enabled = company?.social_media_release_enabled === true;
      text = String(company?.social_media_release_text || "");
    }
    if (!enabled || !text) return NextResponse.json({ enabled: false });

    return NextResponse.json({
      enabled: true,
      text,
      consent:
        inspection.social_media_consent === true
          ? true
          : inspection.social_media_consent === false
            ? false
            : null,
      consentName: inspection.social_media_consent_name || "",
      consentAt: inspection.social_media_consent_at || null,
    });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
