import type { CompanyBranding } from "./companyBranding";
import { formatUsdExact } from "./currency";

// The ONE payment-receipt email, shared by the Stripe webhook (auto-receipt on
// online payment) and /api/send-receipt (manual / resend to a past client). A
// clean, printable, light receipt with the company's branding — handles an
// online card payment (shows the processing fee + total charged) and a manual
// payment (cash / check / etc.) the same way.

export type ReceiptInput = {
  branding: CompanyBranding;
  clientName: string;
  property: string;
  receiptNumber: string;
  paidAtLabel: string;
  /** "Card (online)", "Cash", "Check", "ACH", "Zelle", … */
  methodLabel: string;
  /** Check #, Stripe session id, or a free-form note. Optional. */
  reference?: string;
  /** The full invoice/inspection fee, when known. */
  invoiceTotal?: number | null;
  /** Itemized services the client paid for (Home Inspection, Radon, Mold, …). */
  services?: { label: string; amount: number }[];
  amountPaid: number;
  balanceDue: number;
  /** Online card payments only — the portal processing fee + grand total charged. */
  onlineFee?: number | null;
  totalCharged?: number | null;
};

function money(value: any): string {
  return formatUsdExact(Number(value) || 0);
}

function esc(value: any): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ACCENT = "#0f766e"; // teal-700 — reads well on white and in print
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

function row(label: string, value: string, opts?: { strong?: boolean; color?: string }) {
  const color = opts?.color || INK;
  const weight = opts?.strong ? "700" : "400";
  return `
    <tr>
      <td style="padding:7px 0;color:${MUTED};font-size:14px;">${esc(label)}</td>
      <td style="padding:7px 0;text-align:right;color:${color};font-size:14px;font-weight:${weight};white-space:nowrap;">${esc(value)}</td>
    </tr>`;
}

export function buildReceiptHtml(i: ReceiptInput): string {
  const b = i.branding;
  const contact = [b.phone, b.email, b.website].filter(Boolean).map(esc).join("&nbsp;&nbsp;•&nbsp;&nbsp;");
  const isOnline = i.onlineFee != null || i.totalCharged != null;
  const paidInFull = (Number(i.balanceDue) || 0) <= 0;

  const logo = b.logoUrl
    ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}" style="max-height:44px;max-width:220px;display:block;" />`
    : `<div style="font-size:19px;font-weight:800;color:${ACCENT};letter-spacing:0.3px;">${esc(b.name)}</div>`;

  // Itemized services the client paid for, when we have the breakdown; else a
  // single inspection-fee line.
  const serviceList = (i.services || []).filter((s) => s && s.label);
  const serviceRows =
    serviceList.length > 0
      ? serviceList.map((s) => row(s.label, money(s.amount))).join("")
      : i.invoiceTotal != null
        ? row("Inspection services", money(i.invoiceTotal))
        : "";

  // Amount rows — online shows the fee breakdown; manual is just the payment.
  const amountRows = [
    serviceRows,
    serviceList.length > 0 && i.invoiceTotal != null
      ? row("Subtotal", money(i.invoiceTotal), { strong: true })
      : "",
    row("Amount paid", money(i.amountPaid), { strong: true, color: "#15803d" }),
    isOnline && i.onlineFee != null ? row("Online payment fee", money(i.onlineFee)) : "",
    isOnline && i.totalCharged != null
      ? row("Total charged", money(i.totalCharged), { strong: true })
      : "",
    row("Balance due", money(i.balanceDue), {
      strong: true,
      color: paidInFull ? "#15803d" : "#b45309",
    }),
  ]
    .filter(Boolean)
    .join("");

  const detailRows = [
    row("Payment method", i.methodLabel || "—"),
    i.reference ? row("Reference", i.reference) : "",
    row("Paid on", i.paidAtLabel),
    row("Receipt #", i.receiptNumber),
  ]
    .filter(Boolean)
    .join("");

  return `
  <div style="margin:0;padding:0;background:#f1f5f9;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">

        <!-- Header -->
        <div style="padding:24px 28px;border-bottom:1px solid ${LINE};">
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">${logo}</td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">Receipt</div>
                <div style="display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">✓ Paid</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Title -->
        <div style="padding:26px 28px 6px;">
          <h1 style="margin:0;color:${INK};font-size:24px;line-height:1.25;">Payment received</h1>
          <p style="margin:8px 0 0;color:${MUTED};font-size:15px;line-height:1.6;">
            Hi ${esc(i.clientName)}, thank you — this confirms your inspection payment.
          </p>
        </div>

        <!-- Property -->
        <div style="padding:18px 28px 0;">
          <div style="border:1px solid ${LINE};border-radius:12px;padding:14px 16px;background:#f8fafc;">
            <div style="color:${MUTED};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Property</div>
            <div style="margin-top:5px;color:${INK};font-size:16px;font-weight:700;">${esc(i.property)}</div>
          </div>
        </div>

        <!-- Amounts -->
        <div style="padding:20px 28px 4px;">
          <table role="presentation" width="100%" style="border-collapse:collapse;">
            ${amountRows}
          </table>
        </div>

        <!-- Payment details -->
        <div style="padding:8px 28px 24px;">
          <div style="border-top:1px solid ${LINE};padding-top:12px;">
            <table role="presentation" width="100%" style="border-collapse:collapse;">
              ${detailRows}
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:18px 28px;border-top:1px solid ${LINE};background:#f8fafc;">
          <div style="color:${INK};font-size:14px;font-weight:700;">${esc(b.name)}</div>
          ${contact ? `<div style="margin-top:4px;color:${MUTED};font-size:13px;">${contact}</div>` : ""}
          <div style="margin-top:10px;color:${MUTED};font-size:12px;line-height:1.6;">
            This is a receipt for payment received. Please keep it for your records.
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// RCPT-<inspectionId>-<YYYYMMDD>
export function buildReceiptNumber(inspectionId: string | number, paidAt?: string | null): string {
  const d = paidAt ? new Date(paidAt) : new Date();
  const stamp = Number.isNaN(d.getTime())
    ? ""
    : `-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `RCPT-${inspectionId}${stamp}`;
}
