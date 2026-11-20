import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTrackingParams } from "../../../lib/emailTracking";

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

// `fallback` is used when the link's target is missing or off-site. It's the
// report's share-token link, never a raw numeric id (those don't open for an
// anonymous client).
function getSafeTarget(target: string, appUrl: string, fallback: string) {
  if (!target) return fallback;

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

  return fallback;
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

  // Owner → inspector campaign emails (owner_inspector_messages): record the click
  // and redirect to the original link (any https target we ourselves put in the
  // email, e.g. the App Store link, is allowed here).
  const ownerMessageId = url.searchParams.get("owner_message_id") || "";
  if (ownerMessageId) {
    try {
      await supabaseAdmin
        .from("owner_inspector_messages")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", ownerMessageId)
        .is("clicked_at", null);
    } catch {
      /* best-effort */
    }
    // Only redirect to hosts our own campaign emails link to — any other
    // target made this an open redirect (phishing links on the FLOW domain).
    let dest = "https://app.flowinspect.app";
    try {
      const parsed = new URL(target);
      const host = parsed.hostname.toLowerCase();
      const allowedHost =
        host === "flowinspect.app" ||
        host.endsWith(".flowinspect.app") ||
        host === "apps.apple.com" ||
        host === "testflight.apple.com" ||
        host === "play.google.com";
      if (parsed.protocol === "https:" && allowedHost) {
        dest = parsed.toString();
      }
    } catch {
      /* keep default */
    }
    return NextResponse.redirect(dest);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  // No/invalid target → the app's home page. Never resolve the inspection's
  // share token from the raw id here: this route needs no login, so that would
  // hand out every report's private link to anyone stepping through ids.
  const safeTarget = getSafeTarget(target, appUrl, `${appUrl}/`);

  try {
    const numericInspectionId = Number(inspectionId);

    // Record only clicks on links FLOW signed (lib/emailTracking); anything else
    // still redirects, it just isn't counted.
    if (numericInspectionId && Number.isFinite(numericInspectionId) && verifyTrackingParams(url.searchParams)) {
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

    }
  } catch (error) {
    console.error("Email click tracking error:", error);
  }

  return NextResponse.redirect(safeTarget);
}
