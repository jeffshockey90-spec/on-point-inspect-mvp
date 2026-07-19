import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { DEFAULT_TIME_ZONE } from "../../../../lib/app-time";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("profiles").select("time_zone,time_format,device_time_zone").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    timeZone: data?.time_zone || DEFAULT_TIME_ZONE,
    timeFormat: data?.time_format === "12h" ? "12h" : "24h",
    deviceTimeZone: data?.device_time_zone || null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const timeZone = String(body.timeZone || DEFAULT_TIME_ZONE);
  const timeFormat = body.timeFormat === "12h" ? "12h" : "24h";
  const deviceTimeZone = String(body.deviceTimeZone || timeZone);
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); }
  catch { return NextResponse.json({ error: "Invalid time zone" }, { status: 400 }); }
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    time_zone: timeZone,
    time_format: timeFormat,
    device_time_zone: deviceTimeZone,
    time_preferences_updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, timeZone, timeFormat });
}
