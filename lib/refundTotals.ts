// Combines refunds recorded manually in the app (cash/check/Zelle via Record
// Refund) with refunds issued in Stripe. Stripe's charge.amount_refunded is a
// CUMULATIVE total, and the webhook used to write it straight into
// amount_refunded — wiping out any manual refund already recorded (a $100 cash
// refund then a $50 Stripe refund read as $50 total).
//
// With the stripe_amount_refunded column (supabase/add-stripe-amount-refunded.sql)
// the manual part is kept exactly: total = manual + Stripe. Without that column
// yet, the total can only grow (never wipe a larger manual figure).
export function combineRefunds(input: {
  existingTotal: number;
  /** Stripe's cumulative total we last recorded, or null when the column doesn't exist. */
  previousStripe: number | null;
  stripeCumulative: number;
}): number {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const existing = Math.max(0, input.existingTotal || 0);
  const stripe = Math.max(0, input.stripeCumulative || 0);
  if (input.previousStripe === null) return round2(Math.max(existing, stripe));
  const manualPart = Math.max(0, existing - Math.max(0, input.previousStripe));
  return round2(manualPart + stripe);
}

// Record Refund is for money returned OUTSIDE Stripe (cash, check, Zelle...).
// A Stripe card payment must be refunded in Stripe: the charge.refunded webhook
// records it. Recording it here as well counted the same refund twice (the
// manual figure was kept as "manual" and Stripe's total added on top). The form
// pre-fills the job's payment method, which is "Stripe" for portal payments,
// so a blank/Card/Stripe method on a Stripe-paid job is treated as Stripe.
export const STRIPE_REFUND_MESSAGE =
  "This payment was made through Stripe. Refund it in your Stripe dashboard and FLOW records it automatically. Use Record Refund only for money you returned another way (cash, check, Zelle, etc.) and pick that method.";

export function manualRefundBlockReason(input: {
  method: string;
  inspectionPaymentMethod?: string | null;
}): string | null {
  const method = String(input.method || "").trim().toLowerCase();
  const paidVia = String(input.inspectionPaymentMethod || "").trim().toLowerCase();
  if (method.includes("stripe")) return STRIPE_REFUND_MESSAGE;
  if (paidVia.includes("stripe") && (method === "" || method === "card")) return STRIPE_REFUND_MESSAGE;
  return null;
}
