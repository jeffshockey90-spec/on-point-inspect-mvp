import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getValidAccessToken, upsertCalendarEvent } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.flowinspect.app";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}

function nextDay(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// GET: connection status.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { data } = await admin()
    .from("google_calendar_connections")
    .select("connected_email, enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({
    connected: Boolean(data?.enabled),
    email: data?.connected_email || null,
    configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
  });
}

// DELETE: disconnect.
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const db = admin();
  await db.from("google_calendar_connections").delete().eq("user_id", user.id);
  await db.from("google_calendar_events").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// POST: push the inspector's upcoming inspections to their Google Calendar.
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = admin();
  const accessToken = await getValidAccessToken(db, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar isn't connected." }, { status: 400 });
  }

  const { data: conn } = await db
    .from("google_calendar_connections")
    .select("calendar_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const calendarId = conn?.calendar_id || "primary";

  const today = new Date().toISOString().slice(0, 10);
  const { data: inspections } = await db
    .from("inspections")
    .select("id, property_address, address, city, state, zip, client_name, inspection_date, inspection_time")
    .eq("inspector_id", user.id)
    .not("inspection_date", "is", null)
    .gte("inspection_date", today)
    .order("inspection_date", { ascending: true })
    .limit(300);

  const { data: existing } = await db
    .from("google_calendar_events")
    .select("inspection_id, event_id")
    .eq("user_id", user.id);
  const eventByInspection = new Map((existing || []).map((e: any) => [String(e.inspection_id), e.event_id]));

  let synced = 0;
  for (const insp of inspections || []) {
    const date = String(insp.inspection_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const addr = insp.property_address || insp.address || insp.client_name || "Inspection";
    const time = insp.inspection_time ? `${String(insp.inspection_time).trim()} ` : "";
    const location = [insp.property_address || insp.address, insp.city, insp.state, insp.zip]
      .filter(Boolean)
      .join(", ");

    const event = {
      summary: `${time}Inspection - ${addr}`,
      description: `${insp.client_name ? `Client: ${insp.client_name}\n` : ""}${SITE}/reports/${insp.id}`,
      location: location || undefined,
      start: { date },
      end: { date: nextDay(date) },
    };

    const existingId = eventByInspection.get(String(insp.id)) || null;
    const eventId = await upsertCalendarEvent(accessToken, calendarId, existingId, event);
    if (eventId) {
      await db.from("google_calendar_events").upsert(
        { inspection_id: insp.id, user_id: user.id, event_id: eventId, updated_at: new Date().toISOString() },
        { onConflict: "inspection_id" },
      );
      synced += 1;
    }
  }

  return NextResponse.json({ ok: true, synced });
}
