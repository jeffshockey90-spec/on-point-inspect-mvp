import { brandEmailHtml } from "./emailBrand";
// Sends the "balance due" invoice reminder (with a Pay link from the one shared
// checkout path, lib/stripeCheckout) to every client on an inspection. Shared by
// the manual "Send reminder" button (/api/send-invoice-reminder) and the
// automatic daily reminder job (/api/cron/auto-reminders).

import { Resend } from "resend";
import { createInspectionCheckoutSession } from "./stripeCheckout";
import { listUnsubscribeHeaders, isEmailUnsubscribed } from "./emailUnsubscribe";
import { getCompanyBrandingById, buildBrandedFromHeader, brandedReplyTo } from "./companyBranding";
import { isPaymentSettled } from "./paymentSettled";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

// The stored price only. There used to be a hardcoded sqft formula fallback
// ($500 + $50/1000 sqft — one company's rates) that billed a made-up balance for
// any job without a saved price; "no price" now means no balance to collect.
function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    0
  );
}

function getAmountPaid(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

export function getBalanceDue(inspection: any) {
  // Paid / waived / refunded: never send a "Balance Due" reminder.
  if (isPaymentSettled(inspection)) return 0;
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    const storedBalance = getNumber(inspection.balance_due);

    if (storedBalance > 0) return storedBalance;
  }

  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(getNumber(value));
}

function getValidEmail(value: any) {
  const email = String(value || "").trim();

  if (!email || !email.includes("@") || !email.includes(".")) return "";

  return email;
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type BalanceReminderResult =
  | { ok: true; sent: number; failed: string[] }
  | { ok: false; status: number; error: string; details?: any };

export async function sendBalanceReminder(
  supabase: any,
  inspection: any,
  opts: { appUrl: string; automatic?: boolean },
): Promise<BalanceReminderResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, status: 500, error: "Missing RESEND_API_KEY." };
  }
  const inspectionId = String(inspection.id);
  const appUrl = opts.appUrl;

  const branding = await getCompanyBrandingById(inspection.company_id);

  // A payment reminder goes to ALL clients (primary + co-buyers / co-clients),
  // never the realtor. Gather from inspection_contacts + the primary email.
  const { data: reminderContacts } = await supabase
    .from("inspection_contacts")
    .select("email, role")
    .eq("inspection_id", inspectionId);

  const isClientRole = (role: any) => {
    const r = String(role || "").toLowerCase();
    if (r.includes("realtor") || r.includes("agent") || r.includes("transaction")) {
      return false;
    }
    return (
      r === "client" ||
      r.includes("client") ||
      r.includes("buyer") ||
      r.includes("homeowner")
    );
  };

  const clientEmails = Array.from(
    new Set(
      [
        inspection.client_email,
        ...(reminderContacts || [])
          .filter((c: any) => isClientRole(c.role))
          .map((c: any) => c.email),
      ]
        .map((value) => getValidEmail(value).toLowerCase())
        .filter(Boolean),
    ),
  );

  if (!clientEmails.length) {
    return { ok: false, status: 400, error: "No valid client email found for this inspection." };
  }

  const balanceDue = getBalanceDue(inspection);

  if (balanceDue <= 0) {
    return { ok: false, status: 400, error: "This invoice has no balance due." };
  }

  const property =
    inspection.address ||
    inspection.property_address ||
    "Inspection Property";

  const clientName = inspection.client_name || inspection.client || "Client";

  // Use the EXACT same checkout the client portal "Pay Now" uses: a Stripe
  // Connect direct charge on the inspector's own connected account, WITH the
  // online processing fee. The reminder used to open a checkout on the raw
  // platform account with no fee — that sent the money to the wrong Stripe
  // account and made the inspector eat the card fee. One shared path now.
  const checkout = await createInspectionCheckoutSession({
    supabase,
    inspection,
    appUrl,
  });

  if (!checkout.ok) {
    return { ok: false, status: checkout.status, error: checkout.error, details: checkout.details };
  }

  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <agreements@onpointhomeinspect.com>"
  );

  const resend = new Resend(process.env.RESEND_API_KEY);

  const invoiceSubject = `Invoice Reminder - ${property}`;
  const invoiceReminderHtml = `
      <div style="margin:0;padding:0;background:#020617;font-family:Arial,sans-serif;color:#ffffff;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="border:1px solid #1e293b;background:#0f172a;border-radius:20px;overflow:hidden;">
            <div style="background:#071224;padding:28px;border-bottom:1px solid #1e293b;">
              <p style="margin:0;color:#2dd4bf;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
                ${escapeHtml(branding.name)}
              </p>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:30px;line-height:1.2;">
                Invoice Reminder
              </h1>
              <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">
                This is a friendly reminder that your inspection invoice has a remaining balance.
              </p>
            </div>

            <div style="padding:28px;">
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:16px;">
                Hello ${clientName},
              </p>

              <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.7;">
                Payment is still outstanding for the inspection at:
              </p>

              <div style="border:1px solid #334155;background:#020617;border-radius:14px;padding:18px;margin-bottom:22px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Property
                </p>
                <p style="margin:7px 0 0;color:#ffffff;font-size:18px;font-weight:800;">
                  ${property}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;margin-bottom:22px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Balance Due
                </p>
                <p style="margin:7px 0 0;color:#fb7185;font-size:28px;font-weight:900;">
                  ${money(balanceDue)}
                </p>
              </div>

              <a href="${checkout.url}" style="display:inline-block;background:#14b8a6;color:#020617;text-decoration:none;font-weight:900;padding:14px 22px;border-radius:12px;">
                Pay Invoice
              </a>

              <p style="margin:24px 0 0;color:#cbd5e1;font-size:14px;line-height:1.7;">
                Thank you,<br />
                ${escapeHtml(branding.name)}
              </p>
            </div>
          </div>

          <p style="text-align:center;margin:18px 0 0;color:#64748b;font-size:12px;">
            ${escapeHtml(branding.name)}${
              branding.website || branding.email
                ? ` • ${escapeHtml(branding.website || branding.email || "")}`
                : ""
            }
          </p>
        </div>
      </div>
    `;

  let sentCount = 0;
  const failed: string[] = [];

  for (const recipient of clientEmails) {
    // Honor a one-click unsubscribe per recipient; a reminder is non-essential.
    if (await isEmailUnsubscribed(supabase, recipient)) continue;

    const { error: emailError } = await resend.emails.send({
      from,
      replyTo: brandedReplyTo(branding),
      to: recipient,
      headers: listUnsubscribeHeaders(recipient),
      subject: invoiceSubject,
      html: brandEmailHtml(invoiceReminderHtml, branding),
    });

    if (emailError) {
      console.error("Invoice reminder email error:", emailError);
      failed.push(recipient);
      continue;
    }

    sentCount += 1;

    await supabase.from("email_logs").insert({
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "invoice_reminder",
      subject: invoiceSubject,
      message: checkout.url,
      html: invoiceReminderHtml,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { type: "invoice_reminder", balanceDue, automatic: Boolean(opts.automatic) },
    });
  }

  if (sentCount === 0) {
    return {
      ok: false,
      status: 500,
      error: "Could not send the reminder to any client (all unsubscribed or invalid).",
    };
  }

  return { ok: true, sent: sentCount, failed };
}
