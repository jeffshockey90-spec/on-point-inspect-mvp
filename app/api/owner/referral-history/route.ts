import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "../../../../lib/ownerEmails";
import { resolveTeamInspectorIds } from "../../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One shared referral history across EVERY referral type (home security + insurance,
// and any added later), so Jeff sees the full picture in one place: type, client,
// property, who it went to, which inspector, status, and when. Owner-only, scoped
// to the company's inspectors.
async function requireOwner() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || !isOwnerEmail(user.email)) return null;
  return user;
}

export async function GET(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 100, 300);
  const teamIds = (await resolveTeamInspectorIds(admin, owner.id)) || [];
  const scope = teamIds.length ? teamIds : [owner.id];

  // Pull both referral sources, scoped to the company's inspectors.
  const [sec, ins] = await Promise.all([
    admin
      .from("secure24_leads")
      .select("id, inspection_id, inspector_id, client_name, client_email, status, result_message, lead_token, consent_at, created_at")
      .in("inspector_id", scope)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("insurance_referral_leads")
      .select("id, inspection_id, inspector_id, client_name, client_email, property_address, agent_email, status, result_message, consent_at, created_at")
      .in("inspector_id", scope)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const secRows = sec.data || [];
  const insRows = ins.data || [];

  // Enrich: inspector names, and property addresses for leads without one.
  const inspectorIds = [...new Set([...secRows, ...insRows].map((r: any) => String(r.inspector_id)).filter(Boolean))];
  const inspectionIds = [...new Set([...secRows, ...insRows].map((r: any) => Number(r.inspection_id)).filter(Boolean))];

  const [{ data: profs }, { data: insp }] = await Promise.all([
    inspectorIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", inspectorIds)
      : Promise.resolve({ data: [] as any[] }),
    inspectionIds.length
      ? admin.from("inspections").select("id, property_address, city, state").in("id", inspectionIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const nameOf: Record<string, string> = {};
  for (const p of profs || []) nameOf[String(p.id)] = p.full_name || p.email || "Inspector";
  const addrOf: Record<string, string> = {};
  for (const i of insp || []) addrOf[String(i.id)] = [i.property_address, i.city, i.state].filter(Boolean).join(", ");

  const rows = [
    ...secRows.map((r: any) => ({
      type: "Home security (Secure 24)",
      client: r.client_name || null,
      property: addrOf[String(r.inspection_id)] || null,
      recipient: "Secure 24",
      recipient_email: null as string | null,
      inspector: nameOf[String(r.inspector_id)] || "Unknown",
      status: r.status || null,
      note: r.result_message || null,
      when: r.consent_at || r.created_at || null,
      source_id: r.lead_token || String(r.id),
    })),
    ...insRows.map((r: any) => ({
      type: "Insurance",
      client: r.client_name || null,
      property: r.property_address || addrOf[String(r.inspection_id)] || null,
      recipient: r.agent_email ? "Insurance agent" : "Link-only",
      recipient_email: r.agent_email || null,
      inspector: nameOf[String(r.inspector_id)] || "Unknown",
      status: r.status || null,
      note: r.result_message || null,
      when: r.consent_at || r.created_at || null,
      source_id: String(r.id),
    })),
  ]
    .sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime())
    .slice(0, limit);

  return NextResponse.json({ ok: true, count: rows.length, referrals: rows });
}
