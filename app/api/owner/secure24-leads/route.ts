import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only view of Secure 24 referral volume: total sent, this month, and a
// per-inspector breakdown so Jeff can reconcile the monthly payout.
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

const newest = (cur: string | null, d: any) =>
  d && (!cur || String(d) > cur) ? String(d) : cur;

export async function GET() {
  const owner = await requireOwner();
  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: leads } = await admin
    .from("secure24_leads")
    .select("id, inspection_id, inspector_id, client_name, status, result_message, consent_at, created_at")
    .order("consent_at", { ascending: false });

  const rows = leads || [];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const sent = rows.filter((r) => r.status === "submitted");
  const errors = rows.filter((r) => r.status === "error");

  const thisMonth = sent.filter((r) => {
    const t = new Date(r.consent_at || r.created_at || 0).getTime();
    return Number.isFinite(t) && t >= monthStart;
  }).length;

  // Per-inspector: count of SENT leads + when the last one went out.
  const byId = new Map<string, { inspector_id: string; count: number; lastAt: string | null }>();
  for (const r of sent) {
    const key = String(r.inspector_id || "(unknown)");
    if (!byId.has(key)) byId.set(key, { inspector_id: key, count: 0, lastAt: null });
    const a = byId.get(key)!;
    a.count += 1;
    a.lastAt = newest(a.lastAt, r.consent_at || r.created_at);
  }

  const ids = [...byId.keys()].filter((k) => k !== "(unknown)");
  const { data: profs } = ids.length
    ? await admin.from("profiles").select("id, email").in("id", ids)
    : { data: [] as any[] };
  const emailById = new Map((profs || []).map((p: any) => [String(p.id), p.email]));

  const byInspector = [...byId.values()]
    .map((a) => ({ ...a, email: emailById.get(a.inspector_id) || "Unknown inspector" }))
    .sort((x, y) => y.count - x.count);

  const recent = sent.slice(0, 12).map((r) => ({
    inspection_id: r.inspection_id,
    client_name: r.client_name || "—",
    inspector_email: emailById.get(String(r.inspector_id)) || "Unknown inspector",
    at: r.consent_at || r.created_at || null,
  }));

  return NextResponse.json({
    total: sent.length,
    thisMonth,
    errors: errors.length,
    byInspector,
    recent,
  });
}
