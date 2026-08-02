import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only view of recent blocked intrusion attempts logged by
// lib/securityAlerts.ts into the security_events table (service-role only).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!OWNER_EMAILS.includes(String(user.email || "").toLowerCase())) {
      return NextResponse.json({ error: "Owner only." }, { status: 403 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Server not configured." }, { status: 500 });
    }

    const admin = createAdmin(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rawEvents, error } = await admin
      .from("security_events")
      .select("id, created_at, event_type, ip, path, method, user_agent, detail")
      .neq("event_type", "alert_sent")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    // Table may not exist yet (migration not run) — treat as "no events".
    if (error) {
      return NextResponse.json({
        available: false,
        events: [],
        alerts: [],
        summary: { total24h: 0, total7d: 0, distinctIps: 0, alerts7d: 0 },
      });
    }

    const { data: alerts } = await admin
      .from("security_events")
      .select("id, created_at, ip, path, detail")
      .eq("event_type", "alert_sent")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(25);

    const events = rawEvents || [];
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const total24h = events.filter(
      (e: any) => new Date(e.created_at).getTime() > dayAgo
    ).length;
    const distinctIps = new Set(events.map((e: any) => e.ip).filter(Boolean)).size;

    return NextResponse.json({
      available: true,
      events: events.slice(0, 60),
      alerts: alerts || [],
      summary: {
        total24h,
        total7d: events.length,
        distinctIps,
        alerts7d: (alerts || []).length,
      },
    });
  } catch (error: any) {
    console.error("Security events route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load security events." },
      { status: 500 }
    );
  }
}
