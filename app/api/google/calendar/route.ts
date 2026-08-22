import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getValidAccessToken, syncUserUpcomingInspections } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const synced = await syncUserUpcomingInspections(db, user.id);
  return NextResponse.json({ ok: true, synced });
}
