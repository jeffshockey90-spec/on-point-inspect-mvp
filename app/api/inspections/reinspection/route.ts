import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";
import {
  createReinspection,
  OriginalReportWriteError,
  setReinspectionVerdict,
} from "../../../../lib/reinspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const result = await createReinspection(db, {
      parent,
      today: new Date().toISOString().slice(0, 10),
    });
    return NextResponse.json({ ok: true, id: result.id, carriedFindings: result.carriedFindings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not create re-inspection." },
      { status: 500 },
    );
  }
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

  // Ownership is not permission to rewrite history. setReinspectionVerdict
  // refuses a finding that belongs to an ORIGINAL report -- this route used to
  // check only ownership, so passing an original finding's id stamped
  // reinspection_status onto the historical record.
  try {
    const result = await setReinspectionVerdict(db, { findingId, status });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error: any) {
    if (error instanceof OriginalReportWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Update failed." }, { status: 500 });
  }
}
