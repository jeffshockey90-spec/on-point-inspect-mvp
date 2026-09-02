import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { normalizeAgentLink } from "../../../../lib/insuranceReferral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-INSPECTOR insurance-agent referral settings. Each inspector enters their
// OWN agent; this row is keyed by user_id and is never shared with another
// inspector or company. Default OFF — nothing shows to a client until this
// inspector turns it on and enters at least a link or the agent's email.

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

const str = (v: any) => String(v ?? "").trim();

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createAdminClient();
    const { data } = await admin
      .from("insurance_referral_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      enabled: data?.enabled === true,
      agentName: data?.agent_name || "",
      agentCompany: data?.agent_company || "",
      agentPhone: data?.agent_phone || "",
      agentEmail: data?.agent_email || "",
      agentLink: data?.agent_link || "",
      blurb: data?.blurb || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load setting." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled === true;
    const agentName = str(body?.agentName);
    const agentCompany = str(body?.agentCompany);
    const agentPhone = str(body?.agentPhone);
    const agentEmail = str(body?.agentEmail).toLowerCase();
    const agentLink = normalizeAgentLink(body?.agentLink);
    const blurb = str(body?.blurb);

    // Turning it on needs a way for the client to actually reach the agent:
    // either a link or the agent's email. Guard so an empty referral never ships.
    if (enabled && !agentLink && !agentEmail) {
      return NextResponse.json(
        { error: "Add the agent's link or email before turning this on." },
        { status: 400 },
      );
    }
    if (agentEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(agentEmail)) {
      return NextResponse.json({ error: "That agent email doesn't look valid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("insurance_referral_settings")
      .upsert(
        {
          user_id: user.id,
          user_email: String(user.email || "").toLowerCase(),
          enabled,
          agent_name: agentName || null,
          agent_company: agentCompany || null,
          agent_phone: agentPhone || null,
          agent_email: agentEmail || null,
          agent_link: agentLink || null,
          blurb: blurb || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      enabled,
      agentName,
      agentCompany,
      agentPhone,
      agentEmail,
      agentLink: agentLink || "",
      blurb,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not save setting." }, { status: 500 });
  }
}
