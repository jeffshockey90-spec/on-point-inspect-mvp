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

function getSafeTarget(target: string, appUrl: string, inspectionId: string) {
  if (!target) return `${appUrl}/share/${inspectionId}`;

  try {
    const parsedTarget = new URL(target);
    const parsedApp = new URL(appUrl);

    if (parsedTarget.host === parsedApp.host) {
      return parsedTarget.toString();
    }
  } catch {
    if (target.startsWith("/")) {
      return `${appUrl}${target}`;
    }
  }

  return `${appUrl}/share/${inspectionId}`;
}

export async function GET(req: Request) {
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

  const target = url.searchParams.get("target") || "";

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const safeTarget = getSafeTarget(target, appUrl, inspectionId || "");

  try {
    const numericInspectionId = Number(inspectionId);

    if (numericInspectionId && Number.isFinite(numericInspectionId)) {
      await supabaseAdmin.from("inspection_view_events").insert({
        inspection_id_bigint: numericInspectionId,
        view_type: "email_click",
        contact_id: null,
        viewer_role: recipientType || null,
        viewer_email: recipientEmail || null,
        path: safeTarget,
        user_agent: req.headers.get("user-agent") || null,
        ip_address: getClientIp(req) || null,
        metadata: {
          source: "email_report_link",
          recipient_type: recipientType || null,
          target: safeTarget,
        },
      });

      // Best-effort update for email_logs. If these optional columns do not exist,
      // the view event above still records the click.
      await supabaseAdmin
        .from("email_logs")
        .update({
          clicked_at: new Date().toISOString(),
        })
        .eq("inspection_id_bigint", numericInspectionId)
        .eq("recipient_email", recipientEmail)
        .in("email_type", ["inspection_report", "environmental_report"]);

      await supabaseAdmin
        .from("email_logs")
        .update({
          clicked_at: new Date().toISOString(),
        })
        .eq("inspection_id", numericInspectionId)
        .eq("recipient_email", recipientEmail)
        .in("email_type", ["inspection_report", "environmental_report"]);
    }
  } catch (error) {
    console.error("Email click tracking error:", error);
  }

  return NextResponse.redirect(safeTarget);
}
