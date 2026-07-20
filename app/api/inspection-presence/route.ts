import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("inspection_presence_sessions")
    .select("*, inspections(id,property_address,property_latitude,property_longitude,scheduled_start_at,inspection_date,inspection_time,status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data || null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const inspectionId = String(body.inspectionId || "");
  const now = new Date().toISOString();

  if (action === "activate") {
    if (!inspectionId) return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
    const { data: inspection } = await supabase.from("inspections").select("id,inspector_id").eq("id", inspectionId).maybeSingle();
    if (!inspection || (inspection.inspector_id && inspection.inspector_id !== user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await supabase.from("inspection_presence_sessions").update({ status: "closed", closed_at: now, updated_at: now }).eq("user_id", user.id).eq("status", "active");
    const { data, error } = await supabase.from("inspection_presence_sessions").insert({
      user_id: user.id,
      inspection_id: inspectionId,
      status: "active",
      geofence_radius_meters: Number(body.radiusMeters) || 220,
      activated_at: now,
      updated_at: now,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, session: data });
  }

  const { data: session } = await supabase.from("inspection_presence_sessions").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!session) return NextResponse.json({ error: "No active presence session" }, { status: 404 });

  const patch: Record<string, any> = { updated_at: now };
  if (action === "arrive") { patch.arrived_at = body.recordedAt || now; patch.arrival_latitude = body.latitude ?? null; patch.arrival_longitude = body.longitude ?? null; }
  else if (action === "depart") { patch.departed_at = body.recordedAt || now; patch.departure_latitude = body.latitude ?? null; patch.departure_longitude = body.longitude ?? null; patch.departure_prompted_at = now; }
  else if (action === "confirm_mileage") { patch.departure_confirmed_at = now; patch.mileage_started_at = body.mileageStartedAt || now; patch.status = "closed"; patch.closed_at = now; }
  else if (action === "dismiss_departure") { patch.departure_dismissed_at = now; }
  else if (action === "close") { patch.status = "closed"; patch.closed_at = now; }
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const { data, error } = await supabase.from("inspection_presence_sessions").update(patch).eq("id", session.id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session: data });
}
