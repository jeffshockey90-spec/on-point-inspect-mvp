import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";
import {
  createReinspection,
  deleteDraftReinspection,
  loadReinspectionItems,
  OriginalReportWriteError,
  saveReinspectionDraft,
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
    .select("id, title, section, severity, reinspection_status, reinspection_note, reinspection_summary, source_finding_id")
    .eq("inspection_id", inspectionId)
    .order("id", { ascending: true });

  // On a re-inspection, also return the BEFORE side: the original finding and
  // its photos, read through source_finding_id. Read-only — loadReinspectionItems
  // writes nothing, and the original photo rows are handed back as they are
  // rather than copied onto the re-inspection.
  let items: any[] = [];
  if (owns.parent_inspection_id) {
    try {
      const loaded = await loadReinspectionItems(db, inspectionId);
      items = loaded.items;
    } catch {
      items = [];
    }
  }

  return NextResponse.json({
    parent_inspection_id: owns.parent_inspection_id || null,
    findings: findings || [],
    items,
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

// PATCH: set a finding's re-inspection verdict, and/or save its re-inspection
// note / drafted summary. Both paths go through lib/reinspection, so neither can
// land on an original finding.
export async function PATCH(request: Request) {
  const { user, userClient } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const findingId = Number(body?.findingId);
  const status = body?.status === undefined ? null : String(body.status);
  const allowed = ["corrected", "not_corrected", "not_evaluated"];

  const draft: Record<string, any> = {};
  if (typeof body?.note === "string") draft.reinspection_note = body.note;
  if (typeof body?.summary === "string") draft.reinspection_summary = body.summary;

  if (!Number.isFinite(findingId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (status !== null && !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (status === null && !Object.keys(draft).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
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

  // Ownership is not permission to rewrite history. Both helpers refuse a
  // finding that belongs to an ORIGINAL report -- this route used to check only
  // ownership, so passing an original finding's id stamped reinspection_status
  // onto the historical record.
  try {
    let result: any = { ok: true };
    if (status !== null) {
      const verdict = await setReinspectionVerdict(db, { findingId, status });
      result.status = verdict.status;
    }
    if (Object.keys(draft).length) {
      const saved = await saveReinspectionDraft(db, { findingId, fields: draft });
      result.saved = saved.fields;
    }
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof OriginalReportWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Update failed." }, { status: 500 });
  }
}

// DELETE: discard a draft re-inspection. Scoped to the re-inspection's own rows,
// so discarding one never removes an original finding or an original photo.
export async function DELETE(request: Request) {
  const { user, userClient } = await getUserAndClient();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const inspectionId = Number(
    body?.inspectionId ?? new URL(request.url).searchParams.get("inspectionId"),
  );
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Missing inspection id." }, { status: 400 });
  }

  const filter = await resolveInspectionAccessFilter(userClient, user.id);
  const db = admin();
  const { data: owns } = await db
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq(filter.column, filter.value)
    .maybeSingle();
  if (!owns?.id) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const result = await deleteDraftReinspection(db, inspectionId);
    return NextResponse.json({ ok: true, deletedFindings: result.deletedFindings });
  } catch (error: any) {
    if (error instanceof OriginalReportWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Delete failed." }, { status: 500 });
  }
}
