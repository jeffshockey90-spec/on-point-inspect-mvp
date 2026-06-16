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

function cleanString(value: any, fallback: string, maxLength: number) {
  const clean = String(value || fallback).trim();
  return clean.slice(0, maxLength);
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const eventType = cleanString(
      body.eventType || body.event_type,
      "page_view",
      80
    );

    const path = cleanString(body.path, "/", 500);
    const deviceId = cleanString(
      body.deviceId || body.device_id,
      "unknown",
      160
    );

    const userAgent = cleanString(
      body.userAgent || body.user_agent || req.headers.get("user-agent"),
      "",
      1000
    );

    const platform = body.platform
      ? cleanString(body.platform, "", 80)
      : null;

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("app_device_events").insert({
      event_type: eventType,
      path,
      device_id: deviceId,
      user_agent: userAgent,
      platform,
      standalone: body.standalone === true,
      metadata: {
        source: "app_analytics_tracker",
        referrer: body.referrer || null,
        screen: body.screen || null,
        timezone: body.timezone || null,
        app_version: body.appVersion || body.app_version || null,
        ip_hint: getClientIp(req),
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
