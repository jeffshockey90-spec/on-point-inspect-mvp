import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const ALLOWED_EVENTS = new Set([
  "profile_view",
  "qr_scan",
  "booking_click",
  "sample_report_click",
  "phone_click",
  "email_click",
  "website_click",
  "review_click",
  "facebook_click",
  "share_click",
]);

function hashIp(value: string) {
  const salt =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "on-point-inspect";

  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const companyId = String(body.companyId || "").trim();
    const profileSlug = String(body.profileSlug || "").trim();
    const eventType = String(body.eventType || "").trim();
    const sampleReportId = String(body.sampleReportId || "").trim() || null;
    const metadata =
      body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!companyId || !profileSlug || !ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: true, skipped: "missing_env" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const ip = forwardedFor.split(",")[0]?.trim() || "";
    const userAgent = req.headers.get("user-agent") || "";
    const referrer = req.headers.get("referer") || "";

    const { error } = await supabaseAdmin.from("public_profile_analytics").insert({
      company_id: companyId,
      profile_slug: profileSlug,
      event_type: eventType,
      sample_report_id: sampleReportId,
      metadata,
      referrer,
      user_agent: userAgent,
      ip_hash: ip ? hashIp(ip) : null,
    });

    // Do not break public pages if the migration has not been applied yet.
    if (error) {
      console.error("Public profile analytics insert error:", error);
      return NextResponse.json({
        success: true,
        skipped: "insert_failed",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Public profile analytics route error:", error);
    return NextResponse.json({ success: true, skipped: "unexpected_error" });
  }
}
