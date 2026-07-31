import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrCreateShareToken } from "../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";
import { getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../lib/apiAuth";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function getBaseUrl(req: Request) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL;

  if (envUrl) return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;

  return new URL(req.url).origin;
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isClientAgreementRecipient(contact: any) {
  const role = String(contact?.role || "").toLowerCase().trim();

  return (
    Boolean(contact?.email) &&
    Boolean(contact?.agreement_required) &&
    !Boolean(contact?.agreement_signed) &&
    (role === "client" || role === "co-client")
  );
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const contactId = body.contactId ? String(body.contactId) : "";

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const authorizedInspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!authorizedInspection) return notFound("Inspection not found.");

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const branding = await getCompanyBrandingById(inspection.company_id);

    if (inspection.agreement_waived === true) {
      return NextResponse.json(
        {
          error:
            "The agreement requirement is waived for this inspection. Remove the waiver first if you need to send a reminder.",
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("agreement_required", true)
      .eq("agreement_signed", false)
      .in("role", ["client", "co-client"]);

    if (contactId) query = query.eq("id", contactId);

    const { data: contacts, error: contactsError } = await query;
    if (contactsError) throw contactsError;

    const recipients = (contacts || []).filter(isClientAgreementRecipient);

    if (!recipients.length) {
      return NextResponse.json(
        { error: "No unsigned required client/co-client agreement contacts found." },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);
    const portalShareToken = await getOrCreateShareToken(supabase, inspection);

    const propertyAddress =
      inspection.address ||
      inspection.property_address ||
      "the inspection property";

    const fromEmail = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <agreements@onpointhomeinspect.com>"
    );

    const sent: any[] = [];
    const failed: any[] = [];

    for (const contact of recipients) {
      const email = String(contact.email || "").trim().toLowerCase();
      if (!email) continue;

      const agreementUrl = `${baseUrl}/client-agreement/${inspectionId}?contact=${contact.id}&source=reminder`;
      const portalUrl = `${baseUrl}/client-portal/${portalShareToken}`;
      const subject = `Reminder: Inspection Agreement for ${propertyAddress}`;

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
          <h2 style="color:#0f766e;">${escapeHtml(branding.name)}</h2>
          <p>Hi ${contact.name || "there"},</p>
          <p>This is a reminder to review and sign your residential inspection agreement for:</p>
          <p><strong>${propertyAddress}</strong></p>
          <p>
            <a href="${agreementUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
              Review & Sign Agreement
            </a>
          </p>
          <p>Client Portal:<br /><a href="${portalUrl}">${portalUrl}</a></p>
          <p>Thank you,<br />${escapeHtml(branding.name)}</p>
        </div>
      `;

      const text = `Hi ${contact.name || "there"},

This is a reminder to review and sign your residential inspection agreement for:

${propertyAddress}

Agreement:
${agreementUrl}

Client Portal:
${portalUrl}

Thank you,
${branding.name}`;

      const result = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        html,
        text,
      });

      if (result.error) {
        failed.push({
          email,
          contact_id: contact.id,
          error: result.error.message,
        });
        continue;
      }

      sent.push({
        email,
        contact_id: contact.id,
        resend_id: result.data?.id || null,
      });

      await supabase.from("client_portal_events").insert({
        inspection_id: inspectionId,
        event_type: "agreement_reminder_sent",
        event_note: `Agreement reminder sent to client contact ${email}`,
      });
    }

    if (!sent.length) {
      return NextResponse.json(
        {
          error: "Agreement reminder was not sent.",
          failed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Agreement reminder sent to ${sent.length} client recipient${sent.length === 1 ? "" : "s"}.`,
      sent,
      failed,
    });
  } catch (error: any) {
    console.error("Send agreement reminder error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to send agreement reminder.",
      },
      { status: 500 }
    );
  }
}
