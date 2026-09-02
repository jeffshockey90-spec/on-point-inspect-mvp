import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionByToken } from "../../../../lib/insuranceReferral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the no-login client portal to decide whether to show the insurance
// referral card. Resolves the report strictly by its share token, then reads
// the OWNING inspector's per-inspector settings. Returns only display-safe
// fields (never the agent's raw email). Behaves as "off" on any miss.

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
    if (!inspection?.id || !inspection.inspector_id) {
      return NextResponse.json({ enabled: false });
    }

    const { data: setting } = await db
      .from("insurance_referral_settings")
      .select("enabled, agent_name, agent_company, agent_email, agent_link, blurb")
      .eq("user_id", inspection.inspector_id)
      .maybeSingle();

    // Enabled only if the inspector turned it on AND has a way to reach the agent.
    const reachable = Boolean(setting?.agent_link || setting?.agent_email);
    if (setting?.enabled !== true || !reachable) {
      return NextResponse.json({ enabled: false });
    }

    const { data: prior } = await db
      .from("insurance_referral_leads")
      .select("id")
      .eq("inspection_id", inspection.id)
      .eq("status", "submitted")
      .maybeSingle();

    return NextResponse.json({
      enabled: true,
      alreadyRequested: Boolean(prior?.id),
      agentName: setting?.agent_name || "",
      agentCompany: setting?.agent_company || "",
      blurb: setting?.blurb || "",
      // The referral link is meant to be clicked by the client, so it's safe to
      // return here — lets the card open it directly (no popup-blocker issues).
      agentLink: setting?.agent_link || "",
    });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
