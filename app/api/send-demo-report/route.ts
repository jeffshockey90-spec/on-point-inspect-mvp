import { NextResponse } from "next/server";
import { Resend } from "resend";
import { listUnsubscribeHeaders } from "../../../lib/emailUnsubscribe";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";
import {
  getCompanyBrandingById,
  buildBrandedFromHeader,
} from "../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://flowinspect.app"
  );
}

function getValidEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !email.includes(".")) return "";
  return email;
}

// POST /api/send-demo-report — email a prospect (e.g. a new realtor) a link to
// a demo report + the public profile, so the inspector can showcase their work
// straight from the app instead of copying links by hand.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email is not configured (missing RESEND_API_KEY)." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const recipientEmail = getValidEmail(body?.recipientEmail);
  if (!recipientEmail) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  const admin = getAdminClient();
  const inspection = await authorizeInspection(
    admin,
    user.id,
    body?.inspectionId,
    "id, inspector_id, company_id, is_demo",
  );
  if (!inspection) return notFound("Report not found.");

  if (!inspection.is_demo) {
    return NextResponse.json(
      { error: "This is not a demo report. Use Send Report for a real client report." },
      { status: 400 }
    );
  }

  const branding = await getCompanyBrandingById(inspection.company_id);
  const { data: company } = await admin
    .from("companies")
    .select("profile_slug, public_profile_enabled")
    .eq("id", inspection.company_id)
    .maybeSingle();

  const appUrl = getAppUrl();
  const demoLink = `${appUrl}/demo/${inspection.id}`;
  const profileLink =
    company?.profile_slug && company?.public_profile_enabled
      ? `${appUrl}/inspectors/${company.profile_slug}`
      : "";

  const recipientName = String(body?.recipientName || "").trim();
  const personalMessage = String(body?.message || "").trim();

  const subject = `Sample inspection report from ${branding.name}`;
  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>"
  );

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:auto;">
      <div style="background:#0f172a;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#14b8a6;margin:0;">${escapeHtml(branding.name)}</h1>
        <p style="color:#cbd5e1;margin-top:8px;">${escapeHtml(branding.tagline)}</p>
      </div>
      <div style="border:1px solid #cbd5e1;border-top:none;padding:30px;border-radius:0 0 12px 12px;background:#ffffff;">
        <p>Hello${recipientName ? ` ${escapeHtml(recipientName)}` : ""},</p>
        ${
          personalMessage
            ? `<p style="white-space:pre-wrap;">${escapeHtml(personalMessage)}</p>`
            : `<p>I'd love the chance to work with you. Here's a sample of the home inspection reports I deliver — clear, photo-rich, and easy for your clients to read.</p>`
        }

        <div style="text-align:center;margin:28px 0;">
          <a href="${demoLink}" style="display:inline-block;background:#14b8a6;color:#020617;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:16px;">
            View Sample Report
          </a>
        </div>

        ${
          profileLink
            ? `<p style="text-align:center;">
                 <a href="${profileLink}" style="color:#0f766e;font-weight:bold;">See our profile &amp; client reviews &rarr;</a>
               </p>`
            : ""
        }

        <p style="margin-top:24px;">Thank you,<br /><strong>${escapeHtml(branding.name)}</strong></p>
      </div>
    </div>`;

  const { data: sent, error: sendError } = await resend.emails.send({
    from,
    to: recipientEmail,
    headers: listUnsubscribeHeaders(recipientEmail),
    subject,
    html,
  });

  // email_logs.inspection_id is a UUID column; the numeric id goes in
  // inspection_id_bigint. message is NOT NULL in some DBs, so always set it.
  try {
    await admin.from("email_logs").insert({
      inspection_id_bigint: Number(inspection.id),
      recipient: recipientEmail,
      recipient_email: recipientEmail,
      email_type: "demo_report",
      subject,
      message: sendError ? `Demo report email failed: ${sendError.message}` : demoLink,
      html,
      status: sendError ? "failed" : "sent",
      resend_id: sent?.id || null,
      sent_at: sendError ? null : new Date().toISOString(),
      metadata: { demoLink, profileLink },
    });
  } catch (logError) {
    console.error("Demo report email log insert failed:", logError);
  }

  if (sendError) {
    return NextResponse.json(
      { error: sendError.message || "Failed to send the demo report." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, recipient: recipientEmail });
}
