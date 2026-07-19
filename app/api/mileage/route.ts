import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

const EARTH_RADIUS_MILES = 3958.7613;
function radians(value: number) { return (value * Math.PI) / 180; }
function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(x));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: active }, { data: recent }] = await Promise.all([
    supabase.from("mileage_trips").select("*, inspections(property_address,property_latitude,property_longitude)").eq("user_id", user.id).eq("status", "active").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mileage_trips").select("*, inspections(property_address,property_latitude,property_longitude)").eq("user_id", user.id).eq("status", "completed").order("started_at", { ascending: false }).limit(50),
  ]);
  const yearStart = `${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`;
  const { data: yearTrips } = await supabase.from("mileage_trips").select("total_miles").eq("user_id", user.id).eq("status", "completed").gte("started_at", yearStart);
  const yearMiles = (yearTrips || []).reduce((sum, row) => sum + Number(row.total_miles || 0), 0);
  return NextResponse.json({ active: active || null, recent: recent || [], yearMiles });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "start") {
    const { data: existing } = await supabase.from("mileage_trips").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (existing) return NextResponse.json({ error: "A mileage trip is already active.", tripId: existing.id }, { status: 409 });
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const { data, error } = await supabase.from("mileage_trips").insert({
      user_id: user.id,
      inspection_id: body.inspectionId || null,
      purpose: String(body.purpose || "Inspection travel"),
      start_latitude: Number.isFinite(latitude) ? latitude : null,
      start_longitude: Number.isFinite(longitude) ? longitude : null,
      last_latitude: Number.isFinite(latitude) ? latitude : null,
      last_longitude: Number.isFinite(longitude) ? longitude : null,
      last_recorded_at: new Date().toISOString(),
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, trip: data });
  }

  if (action === "point") {
    const tripId = String(body.tripId || "");
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);
    if (!tripId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return NextResponse.json({ error: "Invalid point" }, { status: 400 });
    const { data: trip } = await supabase.from("mileage_trips").select("*").eq("id", tripId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!trip) return NextResponse.json({ error: "Active trip not found" }, { status: 404 });
    if (Number.isFinite(accuracy) && accuracy > 100) return NextResponse.json({ ok: true, ignored: "low_accuracy" });
    let increment = 0;
    if (trip.last_latitude !== null && trip.last_longitude !== null) {
      increment = distanceMiles(Number(trip.last_latitude), Number(trip.last_longitude), latitude, longitude);
      if (increment > 2) return NextResponse.json({ ok: true, ignored: "gps_jump" });
      if (increment < 0.003) increment = 0;
    }
    const totalMiles = Number(trip.total_miles || 0) + increment;
    const recordedAt = body.recordedAt || new Date().toISOString();
    const [{ error: pointError }, { error: tripError }] = await Promise.all([
      supabase.from("mileage_points").insert({ trip_id: tripId, user_id: user.id, latitude, longitude, accuracy_meters: Number.isFinite(accuracy) ? accuracy : null, recorded_at: recordedAt }),
      supabase.from("mileage_trips").update({ total_miles: totalMiles, last_latitude: latitude, last_longitude: longitude, last_recorded_at: recordedAt, updated_at: new Date().toISOString() }).eq("id", tripId).eq("user_id", user.id),
    ]);
    if (pointError || tripError) return NextResponse.json({ error: pointError?.message || tripError?.message }, { status: 500 });
    return NextResponse.json({ ok: true, totalMiles });
  }

  if (action === "stop") {
    const tripId = String(body.tripId || "");
    const { data, error } = await supabase.from("mileage_trips").update({
      status: "completed",
      ended_at: new Date().toISOString(),
      end_latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
      end_longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", tripId).eq("user_id", user.id).eq("status", "active").select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, trip: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
