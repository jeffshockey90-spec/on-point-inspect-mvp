// True when nothing is owed on an inspection regardless of the stored balance:
// paid, waived, not required, or refunded/disputed (money already moved).
// Waived jobs used to keep balance_due = the full price, so they counted as
// revenue, showed as outstanding, and could still get a "Balance Due" email
// with a working Pay link.
const SETTLED = new Set(["paid", "waived", "not required", "refunded", "partial refund", "disputed"]);

type PaymentRow = {
  payment_status?: unknown;
  invoice_status?: unknown;
  invoice_amount?: unknown;
  amount_paid?: unknown;
} | null | undefined;

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Marked "Paid" but a recorded payment is SMALLER than the invoice — e.g. the
 * client paid $300 online, then the inspector raised the price to $400. That's
 * a partial payment with a balance still due, not paid in full. (A "Paid" with
 * no recorded amount is left alone: older jobs were marked paid by hand.)
 */
export function paidWithBalanceRemaining(row: PaymentRow): boolean {
  const status = String(row?.payment_status || row?.invoice_status || "").trim().toLowerCase();
  if (status !== "paid") return false;
  const invoice = num(row?.invoice_amount);
  const paid = num(row?.amount_paid);
  return invoice > 0 && paid > 0 && paid < invoice - 0.005;
}

export function isPaymentSettled(row: PaymentRow): boolean {
  const status = String(row?.payment_status || row?.invoice_status || "").trim().toLowerCase();
  if (paidWithBalanceRemaining(row)) return false;
  return SETTLED.has(status);
}

/** The status to show/save given the amounts: "Paid" with money still owed becomes "Partial". */
export function effectivePaymentStatus(status: string, invoiceAmount: number, amountPaid: number): string {
  const s = String(status || "").trim();
  if (paidWithBalanceRemaining({ payment_status: s, invoice_amount: invoiceAmount, amount_paid: amountPaid })) return "Partial";
  return s;
}

export function isPaymentWaived(row: { payment_status?: unknown; invoice_status?: unknown } | null | undefined): boolean {
  return String(row?.payment_status || row?.invoice_status || "").trim().toLowerCase() === "waived";
}
