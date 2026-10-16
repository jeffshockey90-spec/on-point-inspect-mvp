import { NextResponse } from "next/server";
import { Resend } from "resend";
import { listUnsubscribeHeaders } from "../../../../../lib/emailUnsubscribe";
import { isSmsConfigured, sendSms } from "../../../../../lib/sms";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
} from "../../../../../lib/apiAuth";
import {
  getCompanyBrandingById,
  buildBrandedFromHeader,
} from "../../../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function authorizeInvoice(admin: any, userId: string, invoiceId: string) {
  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return null;
  if (invoice.inspector_id === userId) return invoice;
  if (invoice.company_id) {
    const { data: ownerRow } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    if (ownerRow) return invoice;
  }
  return null;
}

// POST /api/invoices/[id]/review — send a Google review request to the person
// this invoice was billed to (email + best-effort text). Uses the company's own
// Google review link, same as the inspection review flow.
export async function POST(_req: Request, { params }: RouteProps) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = getAdminClient();
  const invoice = await authorizeInvoice(admin, user.id, id);
  if (!invoice) return notFound("Invoice not found.");

  const email = String(invoice.client_email || "").trim();
  const phone = String(invoice.client_phone || "").trim();
  if (!email && !phone) {
    return NextResponse.json(
      { error: "This invoice has no client email or phone to send a review request to." },
      { status: 400 },
    );
  }

  const branding = await getCompanyBrandingById(invoice.company_id);

  // The company's OWN Google review link (set when they connect their Google
  // Business Profile). Prefer the saved link, then a Place-ID write-review link.
  const { data: company } = await admin
    .from("companies")
    .select("google_review_url, google_place_id")
    .eq("id", invoice.company_id)
    .maybeSingle();

  const googleReviewUrl =
    (company?.google_review_url && String(company.google_review_url).trim()) ||
    (company?.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${company.google_place_id}`
      : "") ||
    process.env.GOOGLE_REVIEW_URL ||
    process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
    "";

  if (!googleReviewUrl) {
    return NextResponse.json(
      {
        error:
          "No Google review link is set. Connect your Google Business Profile in Settings so review requests can link to your review page.",
      },
      { status: 400 },
    );
  }

  const clientName = String(invoice.client_name || "").trim() || "there";
  const subject = `Thank you for choosing ${branding.name}`;

  const html = `
  <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
    <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
      <h1 style="color:#2dd4bf; margin-top:0;">${escapeHtml(branding.name)}</h1>
      <p>Hello ${escapeHtml(clientName)},</p>
      <p style="line-height:1.6;">
        Thank you for your business! If you were happy with our service, would you mind
        leaving a quick Google review? Reviews help other homeowners and real estate
        professionals find a service they can rely on.
      </p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(googleReviewUrl)}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
          Leave a Google Review
        </a>
      </p>
      <p style="color:#cbd5e1; line-height:1.6;">I appreciate your business and the chance to help.</p>
      <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />
      <p style="color:#94a3b8; font-size:14px;">
        ${escapeHtml(branding.name)}<br />
        ${escapeHtml(branding.tagline)}
      </p>
    </div>
  </div>`;

  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>",
  );

  let emailSent = false;
  let lastError = "";

  if (email) {
    try {
      const result = await resend.emails.send({
        from,
        to: email,
        headers: listUnsubscribeHeaders(email),
        subject,
        html,
        text: `Hello ${clientName},

Thank you for your business! If you were happy with our service, would you mind leaving a quick Google review?

${googleReviewUrl}

${branding.name}`,
      });
      if (result.error) {
        lastError = result.error.message || "Review request email failed.";
      } else {
        emailSent = true;
      }
    } catch (err: any) {
      lastError = err?.message || "Review request email failed.";
    }

    try {
      await admin.from("email_logs").insert({
        inspection_id_bigint: invoice.inspection_id ? Number(invoice.inspection_id) : null,
        recipient: email,
        recipient_email: email,
        email_type: "review_request",
        subject,
        message: emailSent ? googleReviewUrl : lastError || "Review request failed.",
        html: emailSent ? html : null,
        status: emailSent ? "sent" : "failed",
        sent_at: emailSent ? new Date().toISOString() : null,
        metadata: { invoice_id: invoice.id, googleReviewUrl, channel: "email" },
      });
    } catch (logErr) {
      console.error("Invoice review email log failed:", logErr);
    }
  }

  // Best-effort SMS to the same person.
  let smsSent = false;
  if (isSmsConfigured() && phone) {
    const smsBody = `${branding.name}: Thank you for your business! If you were happy with our service, a quick Google review would mean a lot: ${googleReviewUrl}`;
    const smsResult = await sendSms({ to: phone, body: smsBody }).catch(() => null);
    smsSent = Boolean(smsResult?.ok);
    try {
      await admin.from("email_logs").insert({
        inspection_id_bigint: invoice.inspection_id ? Number(invoice.inspection_id) : null,
        recipient: phone,
        recipient_email: phone,
        email_type: "review_request_sms",
        subject,
        message: smsSent ? googleReviewUrl : smsResult?.error || "Review SMS failed.",
        status: smsSent ? "sent" : "failed",
        sent_at: smsSent ? new Date().toISOString() : null,
        metadata: { invoice_id: invoice.id, googleReviewUrl, channel: "sms" },
      });
    } catch (logErr) {
      console.error("Invoice review SMS log failed:", logErr);
    }
  }

  if (!emailSent && !smsSent) {
    return NextResponse.json(
      { error: lastError || "Review request could not be sent." },
      { status: 500 },
    );
  }

  const channels = [emailSent ? "email" : "", smsSent ? "text" : ""].filter(Boolean).join(" + ");
  return NextResponse.json({
    success: true,
    emailSent,
    smsSent,
    message: `Review request sent by ${channels}.`,
  });
}
