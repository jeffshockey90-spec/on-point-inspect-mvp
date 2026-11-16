// True when nothing is owed on an inspection regardless of the stored balance:
// paid, waived, not required, or refunded/disputed (money already moved).
// Waived jobs used to keep balance_due = the full price, so they counted as
// revenue, showed as outstanding, and could still get a "Balance Due" email
// with a working Pay link.
const SETTLED = new Set(["paid", "waived", "not required", "refunded", "partial refund", "disputed"]);

export function isPaymentSettled(row: { payment_status?: unknown; invoice_status?: unknown } | null | undefined): boolean {
  const status = String(row?.payment_status || row?.invoice_status || "").trim().toLowerCase();
  return SETTLED.has(status);
}

export function isPaymentWaived(row: { payment_status?: unknown; invoice_status?: unknown } | null | undefined): boolean {
  return String(row?.payment_status || row?.invoice_status || "").trim().toLowerCase() === "waived";
}
