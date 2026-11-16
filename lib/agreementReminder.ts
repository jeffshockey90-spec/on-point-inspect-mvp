import { brandEmailHtml } from "./emailBrand";
// Sends the "please sign your inspection agreement" reminder (email + best-effort
// SMS) to an inspection's unsigned required client/co-client signers. Shared by
// the manual "Send reminder" button (/api/send-agreement-reminder) and the
// automatic daily reminder job (/api/cron/auto-reminders) so both send the exact
// same message, honor unsubscribes, and log the same way.

import { Resend } from "resend";
import { listUnsubscribeHeaders, isEmailUnsubscribed } from "./emailUnsubscribe";
import { getOrCreateShareToken } from "./shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader, brandedReplyTo } from "./companyBranding";
import { isSmsConfigured, sendSms } from "./sms";
import { describeSmsOutcome } from "./smsOutcome";

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

export type AgreementReminderResult =
  | {
      ok: true;
      message: string;
      sent: any[];
      failed: any[];
      smsSent: number;
      smsSkippedNoPhone: number;
      smsFailed: number;
    }
  | { ok: false; status: number; error: string; failed?: any[] };

export async function sendAgreementReminder(
  supabase: any,
  inspection: any,
  opts: { baseUrl: string; contactId?: string; automatic?: boolean },
): Promise<AgreementReminderResult> {
  const inspectionId = String(inspection.id);
  const contactId = opts.contactId || "";
  const baseUrl = opts.baseUrl;
  const source = opts.automatic ? "auto_reminder" : "reminder";

  if (inspection.agreement_waived === true) {
    return {
      ok: false,
      status: 400,
      error:
        "The agreement requirement is waived for this inspection. Remove the waiver first if you need to send a reminder.",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    return { ok: false, status: 500, error: "Missing RESEND_API_KEY." };
  }

  const branding = await getCompanyBrandingById(inspection.company_id);

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
    return {
      ok: false,
      status: 400,
      error: "No unsigned required client/co-buyer agreement contacts found.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const portalShareToken = await getOrCreateShareToken(supabase, inspection, { required: true });

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
  let smsSentCount = 0;
  let smsSkippedNoPhoneCount = 0;
  let smsFailedCount = 0;

  for (const contact of recipients) {
    const email = String(contact.email || "").trim().toLowerCase();
    if (!email) continue;
    // Honor a one-click unsubscribe: reminders are non-essential, so skip.
    if (await isEmailUnsubscribed(supabase, email)) continue;

    const agreementUrl = `${baseUrl}/client-agreement/${portalShareToken}?contact=${contact.id}&source=${source}`;
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
      replyTo: brandedReplyTo(branding),
      to: email,
      headers: listUnsubscribeHeaders(email),
      subject,
      html: brandEmailHtml(html, branding),
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

    await supabase.from("email_logs").insert({
      inspection_id_bigint: Number(inspectionId),
      recipient: email,
      recipient_email: email,
      email_type: "agreement_reminder",
      subject,
      message: portalUrl,
      html,
      status: "sent",
      resend_id: result.data?.id || null,
      sent_at: new Date().toISOString(),
      metadata: {
        type: "agreement_reminder",
        contactId: contact.id,
        portalUrl,
        automatic: Boolean(opts.automatic),
      },
    });

    await supabase.from("client_portal_events").insert({
      inspection_id: inspectionId,
      event_type: "agreement_reminder_sent",
      event_note: `${opts.automatic ? "Automatic agreement" : "Agreement"} reminder sent to client contact ${email}`,
    });

    // Best-effort SMS reminder to this signer (requires a phone on the
    // contact + Twilio configured). Never blocks the email. Keeps this
    // reminder path in parity with /api/send-agreement-email's SMS send.
    const contactPhone = String(contact.phone || "").trim();
    if (isSmsConfigured()) {
      if (!contactPhone) {
        smsSkippedNoPhoneCount += 1;
      } else {
        const smsBody = `${branding.name}: Reminder to review & sign your inspection agreement for ${propertyAddress}. Sign: ${agreementUrl}`;
        const smsResult = await sendSms({ to: contactPhone, body: smsBody }).catch(() => null);
        if (smsResult?.ok) smsSentCount += 1;
        else smsFailedCount += 1;

        await supabase.from("email_logs").insert({
          inspection_id_bigint: Number(inspectionId),
          recipient: contactPhone,
          recipient_email: contactPhone,
          email_type: "agreement_reminder_sms",
          subject: `Agreement Reminder SMS - ${propertyAddress}`,
          message: agreementUrl,
          status: smsResult?.ok ? "sent" : "failed",
          sent_at: smsResult?.ok ? new Date().toISOString() : null,
          metadata: {
            type: "agreement_reminder_sms",
            contactId: contact.id,
            channel: "sms",
            automatic: Boolean(opts.automatic),
            error: smsResult?.ok ? undefined : smsResult?.error || "Agreement reminder SMS failed.",
          },
        });
      }
    }
  }

  if (!sent.length) {
    return { ok: false, status: 500, error: "Agreement reminder was not sent.", failed };
  }

  const smsOutcome = describeSmsOutcome({
    sent: smsSentCount,
    skippedNoPhone: smsSkippedNoPhoneCount,
    failed: smsFailedCount,
  });

  return {
    ok: true,
    message: `Agreement reminder sent to ${sent.length} client recipient${sent.length === 1 ? "" : "s"}${
      smsOutcome ? ` (${smsOutcome})` : ""
    }.`,
    sent,
    failed,
    smsSent: smsSentCount,
    smsSkippedNoPhone: smsSkippedNoPhoneCount,
    smsFailed: smsFailedCount,
  };
}
