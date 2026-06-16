import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventType = String(body.eventType || body.event_type || "page_view").slice(0, 80);
    const path = String(body.path || "/").slice(0, 500);
    const deviceId = String(body.deviceId || body.device_id || "unknown").slice(0, 160);
    const userAgent = String(body.userAgent || body.user_agent || req.headers.get("user-agent") || "").slice(0, 1000);

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("app_device_events").insert({
      event_type: eventType,
      path,
      device_id: deviceId,
      user_agent: userAgent,
      platform: body.platform || null,
      standalone: body.standalone === true,
      metadata: {
        source: "app_analytics_tracker",
      },
    });

    if (error) {
      console.error("App analytics insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("App analytics route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to track app analytics event." },
      { status: 500 }
    );
  }
}
