// Standalone (add-on) invoice statuses. Beyond draft / sent / paid, Stripe
// refunds and disputes now record refunded / partially_refunded / disputed.
// A "closed" invoice was paid at some point: it's view-only and can't be
// re-paid, edited or deleted.
export const CLOSED_INVOICE_STATUSES = ["paid", "refunded", "partially_refunded", "disputed"] as const;

export function isInvoiceClosed(status: unknown): boolean {
  return (CLOSED_INVOICE_STATUSES as readonly string[]).includes(String(status || "").toLowerCase());
}

export function invoiceStatusLabel(status: unknown): string {
  const s = String(status || "draft").toLowerCase();
  if (s === "partially_refunded") return "Partially refunded";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
