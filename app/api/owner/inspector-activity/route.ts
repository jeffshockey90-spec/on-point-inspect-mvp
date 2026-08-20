import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only view: which inspectors actually schedule, publish, send reports, and
// collect payment. Service-role read (bypasses RLS) gated behind an owner check.
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

function isPublished(r: any) {
  return r.published === true || r.is_published === true || Boolean(r.published_at);
}
function isPaid(r: any) {
  return (
    Boolean(r.paid_at) ||
    /paid/i.test(String(r.payment_status || "")) ||
    Number(r.amount_paid) > 0
  );
}

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

  const { data: inspections } = await admin
    .from("inspections")
    .select(
      "id, inspector_id, inspection_date, published, is_published, published_at, payment_status, amount_paid, paid_at, is_demo, created_at",
    );

  // Report emails (with dates) so we know WHICH inspections were sent and WHEN.
  const { data: reportEmails } = await admin
    .from("email_logs")
    .select("inspection_id_bigint, email_type, sent_at, created_at")
    .in("email_type", ["inspection_report", "environmental_report"]);

  // inspection id -> inspector id, so a report-email date maps to an inspector.
  const inspectionToInspector = new Map<string, string>();
  for (const r of inspections || []) {
    inspectionToInspector.set(String(r.id), String(r.inspector_id || "(unknown)"));
  }

  const newest = (cur: string | null, d: any) =>
    d && (!cur || String(d) > cur) ? String(d) : cur;

  const sentInspectionIds = new Set<string>();
  const lastSentByInspector = new Map<string, string>();
  for (const e of reportEmails || []) {
    const iid = String(e.inspection_id_bigint || "");
    if (!iid) continue;
    sentInspectionIds.add(iid);
    const insp = inspectionToInspector.get(iid);
    if (!insp) continue;
    lastSentByInspector.set(
      insp,
      newest(lastSentByInspector.get(insp) || null, e.sent_at || e.created_at) || "",
    );
  }

  type Row = {
    inspector_id: string;
    inspections: number;
    scheduled: number;
    published: number;
    sent: number;
    paid: number;
    lastScheduled: string | null;
    lastPublished: string | null;
    lastSent: string | null;
    lastPaid: string | null;
  };
  const byInspector = new Map<string, Row>();

  for (const r of inspections || []) {
    if (r.is_demo === true) continue; // ignore demo/sample data
    const key = String(r.inspector_id || "(unknown)");
    if (!byInspector.has(key)) {
      byInspector.set(key, {
        inspector_id: key,
        inspections: 0,
        scheduled: 0,
        published: 0,
        sent: 0,
        paid: 0,
        lastScheduled: null,
        lastPublished: null,
        lastSent: null,
        lastPaid: null,
      });
    }
    const a = byInspector.get(key)!;
    a.inspections += 1;
    if (r.inspection_date) {
      a.scheduled += 1;
      a.lastScheduled = newest(a.lastScheduled, r.created_at || r.inspection_date);
    }
    if (isPublished(r)) {
      a.published += 1;
      a.lastPublished = newest(a.lastPublished, r.published_at || r.created_at);
    }
    if (sentInspectionIds.has(String(r.id))) a.sent += 1;
    if (isPaid(r)) {
      a.paid += 1;
      a.lastPaid = newest(a.lastPaid, r.paid_at || r.created_at);
    }
  }

  // Attach last-sent (from the report emails) per inspector.
  for (const [insp, row] of byInspector) {
    row.lastSent = lastSentByInspector.get(insp) || null;
  }

  const ids = [...byInspector.keys()].filter((k) => k !== "(unknown)");
  const { data: profs } = ids.length
    ? await admin.from("profiles").select("id, email").in("id", ids)
    : { data: [] as any[] };
  const emailById = new Map((profs || []).map((p: any) => [String(p.id), p.email]));

  const inspectors = [...byInspector.values()]
    .map((a) => ({
      ...a,
      email: emailById.get(a.inspector_id) || "Unknown inspector",
      isOwner: isOwnerEmail(emailById.get(a.inspector_id)),
    }))
    .sort((x, y) => y.inspections - x.inspections);

  const atLeastOne = (key: keyof Row) =>
    inspectors.filter((i) => (i[key] as number) > 0).length;

  const funnel = {
    inspectors: inspectors.length,
    scheduled: atLeastOne("scheduled"),
    published: atLeastOne("published"),
    sent: atLeastOne("sent"),
    paid: atLeastOne("paid"),
  };

  return NextResponse.json({ funnel, inspectors });
}
