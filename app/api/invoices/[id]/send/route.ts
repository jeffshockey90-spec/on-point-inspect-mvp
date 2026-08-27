import { NextResponse } from "next/server";
import { Resend } from "resend";
import { listUnsubscribeHeaders } from "../../../../../lib/emailUnsubscribe";
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

function money(value: any) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://flowinspect.app"
  );
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

// POST /api/invoices/[id]/send — email the client the itemized invoice with a
// "Pay Invoice" button that points at the Connect checkout route.
export async function POST(_req: Request, { params }: RouteProps) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = getAdminClient();
  const invoice = await authorizeInvoice(admin, user.id, id);
  if (!invoice) return notFound("Invoice not found.");

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email is not configured (missing RESEND_API_KEY)." }, { status: 500 });
  }

  const clientEmail = String(invoice.client_email || "").trim();
  if (!clientEmail) {
    return NextResponse.json(
      { error: "Add a client email to the invoice before sending." },
      { status: 400 }
    );
  }

  // Send to all clients: the invoice's own client email + any co-buyers /
  // co-clients on the linked inspection (never the realtor).
  const recipientEmails: string[] = [clientEmail.toLowerCase()];
  if (invoice.inspection_id) {
    const { data: coContacts } = await admin
      .from("inspection_contacts")
      .select("email, role")
      .eq("inspection_id", invoice.inspection_id);
    for (const c of coContacts || []) {
      const role = String(c?.role || "").toLowerCase();
      const email = String(c?.email || "").trim().toLowerCase();
      const isClient =
        !role.includes("realtor") &&
        !role.includes("agent") &&
        !role.includes("transaction") &&
        (role.includes("client") || role.includes("buyer") || role.includes("homeowner"));
      if (isClient && email.includes("@") && email.includes(".")) {
        recipientEmails.push(email);
      }
    }
  }
  const clientEmails = Array.from(new Set(recipientEmails)).filter(Boolean);

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  if (lineItems.length === 0 || Number(invoice.total) <= 0) {
    return NextResponse.json(
      { error: "Add at least one line item with an amount before sending." },
      { status: 400 }
    );
  }

  const branding = await getCompanyBrandingById(invoice.company_id);
  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>"
  );

  const appUrl = getAppUrl();
  const payLink = `${appUrl}/api/invoices/${invoice.id}/checkout?token=${encodeURIComponent(
    invoice.public_token
  )}`;

  const rowsHtml = lineItems
    .map(
      (li: any) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(li.description || "Item")}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${Number(li.quantity) || 0}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${money(li.unitPrice)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${money(li.amount)}</td>
        </tr>`
    )
    .join("");

  const subject = `Invoice${invoice.invoice_number ? ` ${invoice.invoice_number}` : ""} from ${branding.name}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:auto;">
      <div style="background:#0f172a;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#14b8a6;margin:0;">${escapeHtml(branding.name)}</h1>
        <p style="color:#cbd5e1;margin-top:8px;">${escapeHtml(branding.tagline)}</p>
      </div>
      <div style="border:1px solid #cbd5e1;border-top:none;padding:30px;border-radius:0 0 12px 12px;background:#ffffff;">
        <h2 style="color:#0f766e;margin-top:0;">Invoice${invoice.invoice_number ? ` ${escapeHtml(invoice.invoice_number)}` : ""}</h2>
        ${invoice.client_name ? `<p>Hello ${escapeHtml(invoice.client_name)},</p>` : ""}
        <p>Please find your invoice below.${invoice.due_date ? ` Payment is due by <strong>${escapeHtml(invoice.due_date)}</strong>.` : ""}</p>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:10px 8px;text-align:left;">Description</th>
              <th style="padding:10px 8px;text-align:center;">Qty</th>
              <th style="padding:10px 8px;text-align:right;">Unit</th>
              <th style="padding:10px 8px;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <p style="text-align:right;font-size:20px;font-weight:bold;margin:0 0 24px;">
          Total: ${money(invoice.total)}
        </p>

        <div style="text-align:center;margin:28px 0;">
          <a href="${payLink}" style="display:inline-block;background:#14b8a6;color:#020617;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:16px;">
            Pay Invoice Online
          </a>
        </div>

        ${invoice.notes ? `<p style="color:#475569;white-space:pre-wrap;">${escapeHtml(invoice.notes)}</p>` : ""}

        <p style="margin-top:24px;">Thank you,<br /><strong>${escapeHtml(branding.name)}</strong></p>
      </div>
    </div>`;

  let sentCount = 0;
  let lastError: any = null;

  for (const recipient of clientEmails) {
    const { data: sent, error: sendError } = await resend.emails.send({
      from,
      to: recipient,
      headers: listUnsubscribeHeaders(recipient),
      subject,
      html,
    });

    // Log to email_logs. inspection_id is a UUID column -- only inspection_id_bigint
    // takes the numeric id (and only when the invoice is tied to an inspection).
    // message is NOT NULL in some DBs, so always set it.
    try {
      await admin.from("email_logs").insert({
        inspection_id_bigint: invoice.inspection_id ? Number(invoice.inspection_id) : null,
        recipient,
        recipient_email: recipient,
        email_type: "invoice",
        subject,
        message: sendError ? `Invoice email failed: ${sendError.message}` : payLink,
        html,
        status: sendError ? "failed" : "sent",
        resend_id: sent?.id || null,
        sent_at: sendError ? null : new Date().toISOString(),
        metadata: { invoice_id: invoice.id, payLink },
      });
    } catch (logError) {
      console.error("Invoice email log insert failed:", logError);
    }

    if (sendError) {
      lastError = sendError;
      continue;
    }
    sentCount += 1;
  }

  if (sentCount === 0) {
    return NextResponse.json(
      { error: lastError?.message || "Invoice email failed to send." },
      { status: 500 }
    );
  }

  await admin
    .from("invoices")
    .update({ status: invoice.status === "paid" ? "paid" : "sent", sent_at: new Date().toISOString() })
    .eq("id", invoice.id);

  return NextResponse.json({ success: true, sent: sentCount });
}
