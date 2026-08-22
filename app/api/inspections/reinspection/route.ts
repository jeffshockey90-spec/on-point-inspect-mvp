import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fields carried from the original inspection onto the re-inspection. Status,
// tokens, payment/agreement/report state are deliberately NOT copied -- the
// re-inspection starts fresh on those.
const CARRY_INSPECTION_FIELDS = [
  "client", "realtor", "address", "sqft", "city", "state", "zip", "year_built",
  "property_type", "property_style", "property_image_url", "property_image",
  "property_photo_url", "property_address", "square_feet", "client_name",
  "client_email", "client_phone", "client_organization_name", "realtor_name",
  "realtor_email", "realtor_phone", "realtor_id", "realtor_contact_id",
  "agent_name", "agent_email", "agent_phone", "inspection_time", "services",
  "service_mode", "service_type", "service_fees", "company_id", "inspector_id",
  "property_latitude", "property_longitude",
];
const CARRY_FINDING_FIELDS = [
  "section", "title", "observation", "implication", "recommendation", "severity",
  "category", "tag", "comment", "description", "location", "company_id",
];

async function getUserAndClient() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return { user, userClient };
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function pick(row: any, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

// GET: the findings + re-inspection status for one inspection (for the checklist).
export async function GET(request: Request) {
  const { user, userClient } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const inspectionId = Number(new URL(request.url).searchParams.get("inspectionId"));
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });
  }

  const db = admin();
  const filter = await resolveInspectionAccessFilter(userClient, user.id);
  const { data: owns } = await db
    .from("inspections")
    .select("id, parent_inspection_id")
    .eq("id", inspectionId)
    .eq(filter.column, filter.value)
    .maybeSingle();
  if (!owns?.id) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: findings } = await db
    .from("findings")
    .select("id, title, section, severity, reinspection_status")
    .eq("inspection_id", inspectionId)
    .order("id", { ascending: true });

  return NextResponse.json({
    parent_inspection_id: owns.parent_inspection_id || null,
    findings: findings || [],
  });
}

// POST: create a re-inspection from a parent inspection.
export async function POST(request: Request) {
  const { user, userClient } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parentId = Number(body?.parentId ?? body?.inspectionId);
  if (!Number.isFinite(parentId)) {
    return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });
  }

  // The parent must be within the caller's access scope.
  const filter = await resolveInspectionAccessFilter(userClient, user.id);
  const db = admin();
  const { data: parent } = await db
    .from("inspections")
    .select("*")
    .eq("id", parentId)
    .eq(filter.column, filter.value)
    .maybeSingle();
  if (!parent?.id) {
    return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  }

  const child = {
    ...pick(parent, CARRY_INSPECTION_FIELDS),
    parent_inspection_id: parentId,
    inspection_date: new Date().toISOString().slice(0, 10),
  };
  const { data: created, error: createErr } = await db
    .from("inspections")
    .insert(child)
    .select("id")
    .single();
  if (createErr || !created?.id) {
    return NextResponse.json({ error: createErr?.message || "Could not create re-inspection." }, { status: 500 });
  }

  // Carry the findings over, each pending re-evaluation.
  const { data: parentFindings } = await db
    .from("findings")
    .select("*")
    .eq("inspection_id", parentId)
    .order("id", { ascending: true });

  if (parentFindings && parentFindings.length) {
    const rows = parentFindings.map((f: any) => ({
      ...pick(f, CARRY_FINDING_FIELDS),
      inspection_id: created.id,
      reinspection_status: "not_evaluated",
    }));
    await db.from("findings").insert(rows);
  }

  return NextResponse.json({ ok: true, id: created.id });
}

// PATCH: set a finding's re-inspection verdict.
export async function PATCH(request: Request) {
  const { user, userClient } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const findingId = Number(body?.findingId);
  const status = String(body?.status || "");
  const allowed = ["corrected", "not_corrected", "not_evaluated"];
  if (!Number.isFinite(findingId) || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const db = admin();
  const { data: finding } = await db
    .from("findings")
    .select("id, inspection_id")
    .eq("id", findingId)
    .maybeSingle();
  if (!finding?.id) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

  const filter = await resolveInspectionAccessFilter(userClient, user.id);
  const { data: owns } = await db
    .from("inspections")
    .select("id")
    .eq("id", finding.inspection_id)
    .eq(filter.column, filter.value)
    .maybeSingle();
  if (!owns?.id) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const { error } = await db
    .from("findings")
    .update({ reinspection_status: status })
    .eq("id", findingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
