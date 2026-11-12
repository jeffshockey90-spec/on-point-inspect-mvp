import type { CompanyBranding } from "./companyBranding";
import { formatUsdExact } from "./currency";

// The ONE refund-notice email, shared by the preview (GET) and the send (POST)
// in /api/record-refund so the inspector sees exactly what the client receives.
// A clean, printable, light notice with the company's branding. A refund
// returns money already collected — this confirms it to the client; it is not
// an invoice and never implies a balance owed.

export type RefundInput = {
  branding: CompanyBranding;
  clientName: string;
  property: string;
  refundNumber: string;
  refundedAtLabel: string;
  /** "Card (online)", "Cash", "Check", "ACH", "Zelle", … */
  methodLabel: string;
  /** This refund transaction's amount. */
  refundAmount: number;
  /** Cumulative refunded on this inspection (shown when more than this txn). */
  totalRefunded?: number | null;
  /** The original amount the client paid, when known. */
  amountPaid?: number | null;
  /** True when the full collected amount has now been returned. */
  fullyRefunded: boolean;
  /** Free-form reason / reference. Optional. */
  reason?: string;
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

export function buildRefundHtml(i: RefundInput): string {
  const b = i.branding;
  const contact = [b.phone, b.email, b.website].filter(Boolean).map(esc).join("&nbsp;&nbsp;•&nbsp;&nbsp;");

  const logo = b.logoUrl
    ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}" style="max-height:44px;max-width:220px;display:block;" />`
    : `<div style="font-size:19px;font-weight:800;color:${ACCENT};letter-spacing:0.3px;">${esc(b.name)}</div>`;

  const hasTotal =
    i.totalRefunded != null && Number(i.totalRefunded) > Number(i.refundAmount) + 0.005;
  const remainingPaid =
    i.amountPaid != null
      ? Math.max(0, Number(i.amountPaid) - Number(i.totalRefunded ?? i.refundAmount))
      : null;

  const amountRows = [
    row("Refund amount", money(i.refundAmount), { strong: true, color: ACCENT }),
    hasTotal ? row("Total refunded to date", money(i.totalRefunded)) : "",
    i.amountPaid != null ? row("Originally paid", money(i.amountPaid)) : "",
    remainingPaid != null && !i.fullyRefunded
      ? row("Net amount retained", money(remainingPaid))
      : "",
  ]
    .filter(Boolean)
    .join("");

  const detailRows = [
    row("Refund method", i.methodLabel || "—"),
    i.reason ? row("Reason", i.reason) : "",
    row("Refunded on", i.refundedAtLabel),
    row("Reference #", i.refundNumber),
  ]
    .filter(Boolean)
    .join("");

  const headline = i.fullyRefunded ? "Your payment has been refunded" : "A refund has been issued";

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
                <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">Refund</div>
                <div style="display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;background:#ccfbf1;color:${ACCENT};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">↩ Refunded</div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Title -->
        <div style="padding:26px 28px 6px;">
          <h1 style="margin:0;color:${INK};font-size:24px;line-height:1.25;">${esc(headline)}</h1>
          <p style="margin:8px 0 0;color:${MUTED};font-size:15px;line-height:1.6;">
            Hi ${esc(i.clientName)}, this confirms a refund of <strong style="color:${ACCENT};">${money(i.refundAmount)}</strong> for your inspection. Depending on your bank or card issuer, it may take a few business days to appear.
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

        <!-- Refund details -->
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
            This is a confirmation of a refund issued to you. Please keep it for your records. Questions? Contact your inspector using the details above.
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// RFND-<inspectionId>-<YYYYMMDD>
export function buildRefundNumber(inspectionId: string | number, refundedAt?: string | null): string {
  const d = refundedAt ? new Date(refundedAt) : new Date();
  const stamp = Number.isNaN(d.getTime())
    ? ""
    : `-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `RFND-${inspectionId}${stamp}`;
}
