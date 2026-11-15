import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { loadSocialMediaReleaseForInspection } from "../../../../lib/socialMediaRelease";
import { notifySocialMediaConsent } from "../../../../lib/socialMediaConsentNotify";
import { resolveCardInspection, canActOnCard } from "../../../../lib/portalViewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records a client's social-media consent decision (grant or decline) on the
// inspection. No login — resolved by share token, gated on the company having
// the release enabled. A raw inspection id is accepted ONLY from a signed-in
// client contact on that inspection (the portal opened by id withholds the
// token on undelivered reports); staff can never consent for the client. Optional feature: declining is a valid, recorded
// answer and blocks nothing.

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const str = (v: any) => String(v ?? "").trim();

export async function POST(request: Request) {
  const db = admin();
  const body = await request.json().catch(() => ({}));

  const lookup = str(body?.lookup || body?.shareToken || body?.token);
  if (!lookup) return NextResponse.json({ error: "Missing report reference." }, { status: 400 });

  const consent = body?.consent === true; // explicit grant; anything else = decline
  const name = str(body?.name).slice(0, 200);
  const source = ["signing", "portal", "report"].includes(str(body?.source))
    ? str(body?.source)
    : "portal";

  const resolved = await resolveCardInspection(db, lookup);
  const inspection = canActOnCard(resolved) ? resolved.inspection : null;
  if (!inspection?.id) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  // The company must have the release enabled with text (falls back to the
  // inspector's company when the inspection has no company_id).
  const { enabled } = await loadSocialMediaReleaseForInspection(db, inspection);
  if (!enabled) return NextResponse.json({ error: "Not available." }, { status: 404 });

  // A grant should carry a typed name (their signature); a decline doesn't need one.
  if (consent && !name) {
    return NextResponse.json(
      { error: "Please type your name to agree." },
      { status: 400 },
    );
  }

  const { error } = await db
    .from("inspections")
    .update({
      social_media_consent: consent,
      social_media_consent_at: new Date().toISOString(),
      social_media_consent_name: consent ? name : null,
      social_media_consent_source: source,
    })
    .eq("id", inspection.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: ping the owning inspector that this inspection is now cleared
  // to post. Only on a grant; never blocks the client's response.
  if (consent) {
    await notifySocialMediaConsent(db, { inspection }).catch(() => {});
  }

  return NextResponse.json({ ok: true, consent });
}
