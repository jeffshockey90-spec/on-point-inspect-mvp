import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrCreateShareToken } from "../../../lib/shareToken";
import { formatAppValue } from "../../../lib/app-time";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";
import { getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../lib/apiAuth";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

function escapeHtml(value: any) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: any) {
  if (!value) return "Date to be confirmed";

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return cleanText(value);

  return formatAppValue(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: any) {
  const clean = cleanText(value);
  if (!clean) return "Time to be confirmed";

  const [hoursRaw, minutesRaw] = clean.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number((minutesRaw || "00").slice(0, 2));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return clean;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return formatAppValue(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { inspectionId } = await req.json();

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

    const { data: contacts, error: contactsError } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId);

    if (contactsError) {
      return NextResponse.json({ error: contactsError.message }, { status: 500 });
    }

    const recipients: Array<{ email: string; name: string; role: string }> = (contacts || [])
      .filter((contact: any) => {
        const role = cleanText(contact.role).toLowerCase();
        return (
          contact.email &&
          (role === "client" ||
            role === "co-client" ||
            role === "realtor" ||
            role === "transaction coordinator")
        );
      })
      .map((contact: any) => ({
        email: cleanText(contact.email).toLowerCase(),
        name: cleanText(contact.name),
        role: cleanText(contact.role).toLowerCase(),
      }));

    const uniqueRecipients: Array<{ email: string; name: string; role: string }> = Array.from(
      new Map(recipients.map((recipient) => [recipient.email, recipient])).values()
    );

    if (uniqueRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No contacts found.",
        sent: [],
        failed: [],
      });
    }

    const address = [
      inspection.property_address || inspection.address,
      inspection.city,
      inspection.state,
      inspection.zip,
    ]
      .filter(Boolean)
      .join(", ");

    const dateText = formatDate(inspection.inspection_date);
    const timeText = formatTime(inspection.inspection_time);
    const services = cleanText(inspection.services) || "Home Inspection";

    const portalShareToken = await getOrCreateShareToken(supabase, inspection);
    const portalUrl = `${getBaseUrl(req)}/client-portal/${portalShareToken}`;

    const fromEmail = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <agreements@onpointhomeinspect.com>"
    );

    const sent: any[] = [];
    const failed: any[] = [];

    for (const recipient of uniqueRecipients) {
      const isRealtor =
        recipient.role.includes("realtor") || recipient.role.includes("transaction");

      const subject = `Inspection Confirmed - ${address || branding.name}`;
      const greeting = recipient.name ? `Hi ${escapeHtml(recipient.name)},` : "Hello,";

      const note = isRealtor
        ? "This confirms the inspection has been scheduled."
        : "This confirms your inspection has been scheduled.";

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;padding:24px;">
          <h2 style="color:#0f766e;margin:0 0 16px;">${escapeHtml(branding.name)}</h2>

          <p>${greeting}</p>

          <p>${note}</p>

          <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px;">
            <tr><td><strong>Property</strong></td><td>${escapeHtml(address)}</td></tr>
            <tr><td><strong>Date</strong></td><td>${escapeHtml(dateText)}</td></tr>
            <tr><td><strong>Time</strong></td><td>${escapeHtml(timeText)}</td></tr>
            <tr><td><strong>Services</strong></td><td>${escapeHtml(services)}</td></tr>
          </table>

          <p style="margin-top:18px;">
            Your inspection agreement and payment information may be sent separately if required.
          </p>

          <p>
            <a href="${portalUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
              Open Client Portal
            </a>
          </p>

          <p style="margin-top:30px;font-size:12px;color:#64748b;">
            ${escapeHtml(branding.name)}
          </p>
        </div>
      `;

      const text = `${recipient.name ? `Hi ${recipient.name},` : "Hello,"}

${isRealtor ? "This confirms the inspection has been scheduled." : "This confirms your inspection has been scheduled."}

Property: ${address}
Date: ${dateText}
Time: ${timeText}
Services: ${services}

Your inspection agreement and payment information may be sent separately if required.

Client Portal:
${portalUrl}

${branding.name}`;

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: recipient.email,
          subject,
          html,
          text,
        });

        if (result.error) {
          failed.push({
            email: recipient.email,
            role: recipient.role,
            error: result.error.message || "Failed to send appointment confirmation.",
          });

          await supabase.from("email_logs").insert({
            inspection_id_bigint: Number(inspectionId),
            recipient: recipient.email,
            recipient_email: recipient.email,
            email_type: "appointment_confirmed",
            subject,
            message: portalUrl,
            status: "failed",
            resend_id: null,
            sent_at: null,
            metadata: {
              type: "appointment_confirmed",
              role: recipient.role,
              portalUrl,
              error: result.error.message || "Failed to send appointment confirmation.",
            },
          });

          continue;
        }

        sent.push({ email: recipient.email, role: recipient.role, resend_id: result?.data?.id || null });

        await supabase.from("email_logs").insert({
          inspection_id_bigint: Number(inspectionId),
          recipient: recipient.email,
          recipient_email: recipient.email,
          email_type: "appointment_confirmed",
          subject,
          message: portalUrl,
          status: "sent",
          resend_id: result?.data?.id || null,
          sent_at: new Date().toISOString(),
          metadata: { type: "appointment_confirmed", role: recipient.role, portalUrl },
        });
      } catch (error: any) {
        failed.push({
          email: recipient.email,
          role: recipient.role,
          error: error?.message || "Failed to send appointment confirmation.",
        });

        await supabase.from("email_logs").insert({
          inspection_id_bigint: Number(inspectionId),
          recipient: recipient.email,
          recipient_email: recipient.email,
          email_type: "appointment_confirmed",
          subject,
          message: portalUrl,
          status: "failed",
          resend_id: null,
          sent_at: null,
          metadata: {
            type: "appointment_confirmed",
            role: recipient.role,
            portalUrl,
            error: error?.message || "Failed to send appointment confirmation.",
          },
        });
      }
    }

    return NextResponse.json({ success: true, sent, failed });
  } catch (error: any) {
    console.error("Send schedule confirmation error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to send schedule confirmation." },
      { status: 500 }
    );
  }
}
