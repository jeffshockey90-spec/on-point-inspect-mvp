import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

function transparentGifResponse() {
  const pixel = Buffer.from(
    "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64"
  );

  return new NextResponse(pixel, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(pixel.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const inspectionId =
      url.searchParams.get("inspection_id") ||
      url.searchParams.get("inspectionId") ||
      "";

    const recipientType =
      url.searchParams.get("recipient_type") ||
      url.searchParams.get("recipientType") ||
      "";

    const recipientEmail =
      url.searchParams.get("recipient_email") ||
      url.searchParams.get("recipientEmail") ||
      "";

    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
      return transparentGifResponse();
    }

    await supabaseAdmin.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: "email_open",
      contact_id: null,
      viewer_role: recipientType || null,
      viewer_email: recipientEmail || null,
      path: `/api/email-open?inspection_id=${numericInspectionId}`,
      user_agent: req.headers.get("user-agent") || null,
      ip_address: getClientIp(req) || null,
      metadata: {
        source: "email_tracking_pixel",
        recipient_type: recipientType || null,
      },
    });

    // Best-effort update for email_logs. If these optional columns do not exist,
    // the view event above still records the open.
    await supabaseAdmin
      .from("email_logs")
      .update({
        opened_at: new Date().toISOString(),
      })
      .eq("inspection_id_bigint", numericInspectionId)
      .eq("recipient_email", recipientEmail)
      .in("email_type", ["inspection_report", "environmental_report"]);

    await supabaseAdmin
      .from("email_logs")
      .update({
        opened_at: new Date().toISOString(),
      })
      .eq("inspection_id", numericInspectionId)
      .eq("recipient_email", recipientEmail)
      .in("email_type", ["inspection_report", "environmental_report"]);
  } catch (error) {
    console.error("Email open tracking error:", error);
  }

  return transparentGifResponse();
}
