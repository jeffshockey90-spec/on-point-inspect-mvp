import { brandEmailHtml } from "./emailBrand";
// Appointment reminder EMAIL for clients and agents. Used by the reminder cron
// as the fallback when a text can't go out (SMS isn't set up for the platform,
// or that person has no phone on file) — before this, those clients got no
// reminder at all. Same toggles and windows as the texts.

import { Resend } from "resend";
import { listUnsubscribeHeaders, isEmailUnsubscribed } from "./emailUnsubscribe";
import { getCompanyBrandingById, buildBrandedFromHeader, brandedReplyTo } from "./companyBranding";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CLIENT_ROLE = /client|buyer|homeowner|seller/;
const AGENT_ROLE = /realtor|agent|transaction|coordinator/;

function validEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") && email.includes(".") ? email : "";
}

/** Reminder recipients for a role, from inspection_contacts + the inspection's own fields. */
export function reminderEmailsFor(who: "client" | "agent", inspection: any, contacts: any[]): string[] {
  const fromContacts = (contacts || [])
    .filter((c: any) => c?.portal_access !== false)
    .filter((c: any) => {
      const role = String(c?.role || "").toLowerCase();
      if (who === "agent") return AGENT_ROLE.test(role);
      return CLIENT_ROLE.test(role) && !AGENT_ROLE.test(role);
    })
    .map((c: any) => c.email);
  const fromRow =
    who === "client"
      ? [inspection?.client_email]
      : [inspection?.realtor_email, inspection?.agent_email, inspection?.buyer_agent_email];
  return Array.from(new Set([...fromRow, ...fromContacts].map(validEmail).filter(Boolean)));
}

export function buildAppointmentReminderEmail(input: {
  who: "client" | "agent";
  company: string;
  address: string;
  when: string;
  noun?: string;
}) {
  const noun = (input.noun || "inspection").toLowerCase();
  const subject = `Reminder: ${noun} at ${input.address} — ${input.when}`;
  const lead =
    input.who === "agent"
      ? `This is a reminder that your client's ${noun} at ${input.address} is scheduled for ${input.when}.`
      : `This is a reminder that your ${noun} at ${input.address} is scheduled for ${input.when}.`;
  const text = `${lead}

If you need to reschedule, just reply to this email.

Thank you,
${input.company}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="color:#0f766e;">${escapeHtml(input.company)}</h2>
      <p>${escapeHtml(lead)}</p>
      <p>If you need to reschedule, just reply to this email.</p>
      <p>Thank you,<br />${escapeHtml(input.company)}</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendAppointmentReminderEmails(
  admin: any,
  inspection: any,
  opts: { who: "client" | "agent"; recipients: string[]; when: string; address: string; noun?: string; kind: string },
): Promise<{ sent: number; failed: number; to: string[] }> {
  if (!process.env.RESEND_API_KEY || !opts.recipients.length) return { sent: 0, failed: 0, to: [] };

  const branding = await getCompanyBrandingById(inspection.company_id);
  const { subject, text, html } = buildAppointmentReminderEmail({
    who: opts.who,
    company: branding.name,
    address: opts.address,
    when: opts.when,
    noun: opts.noun,
  });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = buildBrandedFromHeader(branding);

  let sent = 0;
  let failed = 0;
  const to: string[] = [];
  for (const email of opts.recipients) {
    if (await isEmailUnsubscribed(admin, email)) continue;
    const result = await resend.emails
      .send({
        from,
        replyTo: brandedReplyTo(branding),
        to: email,
        headers: listUnsubscribeHeaders(email),
        subject,
        html: brandEmailHtml(html, branding),
        text,
      })
      .catch((error: any) => ({ data: null, error }));
    if (result.error) {
      failed += 1;
      continue;
    }
    sent += 1;
    to.push(email);
    await admin.from("email_logs").insert({
      inspection_id_bigint: Number(inspection.id),
      recipient: email,
      recipient_email: email,
      email_type: "appointment_reminder",
      subject,
      message: text,
      html,
      status: "sent",
      resend_id: (result as any).data?.id || null,
      sent_at: new Date().toISOString(),
      metadata: { type: "appointment_reminder", recipient: opts.who, kind: opts.kind },
    });
  }
  return { sent, failed, to };
}
