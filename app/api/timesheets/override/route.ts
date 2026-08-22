import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveTeamInspectorIds } from "../../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set or clear a manual hours correction for one inspection's on-site time.
// Allowed only for the inspection's own inspector or their company owner
// (resolveTeamInspectorIds), so no one edits another company's payroll.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const inspectionId = Number(body?.inspectionId);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Missing inspection." }, { status: 400 });
  }

  const rawHours = body?.hours;
  const hours =
    rawHours === null || rawHours === "" || rawHours === undefined
      ? null
      : Math.max(0, Math.min(24, Number(rawHours)));
  if (hours !== null && !Number.isFinite(hours)) {
    return NextResponse.json({ error: "Invalid hours." }, { status: 400 });
  }
  const note = String(body?.note || "").trim().slice(0, 500) || null;

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // The inspection must belong to someone on the caller's team.
  const { data: inspection } = await admin
    .from("inspections")
    .select("id, inspector_id")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection?.id) {
    return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  }

  const teamIds = await resolveTeamInspectorIds(userClient, user.id);
  const ownerId = String(inspection.inspector_id || "");
  if (!teamIds.map(String).includes(ownerId)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  // Clearing: no hours and no note -> remove the override entirely.
  if (hours === null && !note) {
    await admin.from("timesheet_overrides").delete().eq("inspection_id", inspectionId);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const { error } = await admin.from("timesheet_overrides").upsert(
    {
      inspection_id: inspectionId,
      user_id: ownerId,
      hours,
      note,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "inspection_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hours, note });
}
