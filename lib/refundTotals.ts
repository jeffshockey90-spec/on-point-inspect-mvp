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
