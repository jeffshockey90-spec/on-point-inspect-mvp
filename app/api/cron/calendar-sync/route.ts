import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { syncUserUpcomingInspections } from "../../../../lib/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Auto-sync: pushes every connected inspector's upcoming inspections to their
// Google Calendar on a schedule, so new/rescheduled inspections show up without
// anyone tapping "Sync". Vercel calls this with the CRON_SECRET.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // if no secret configured, don't hard-block the cron
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.json({ ok: true, skipped: "not configured" });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: connections } = await admin
    .from("google_calendar_connections")
    .select("user_id")
    .eq("enabled", true);

  let users = 0;
  let totalSynced = 0;
  for (const conn of connections || []) {
    try {
      const n = await syncUserUpcomingInspections(admin, String(conn.user_id));
      users += 1;
      totalSynced += n;
    } catch {
      // one user's failure shouldn't stop the rest
    }
  }

  return NextResponse.json({ ok: true, users, synced: totalSynced });
}
