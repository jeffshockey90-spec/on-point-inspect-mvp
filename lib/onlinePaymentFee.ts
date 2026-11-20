// Single source of truth for the "online payment fee" a client is charged on
// top of the balance when paying by card. Used by BOTH the checkout route (the
// real charge) and the client portal (the quoted fee/total) so the number shown
// always matches the number charged. Reads the company's fee configuration:
//   online_payment_fee_enabled  false -> no fee ($0)
//   online_payment_fee_type     "stripe_fee" | "flat" | "percentage" (default)
//   online_payment_fee_amount   flat dollars, or a percent (e.g. 3.95 = 3.95%)

// Stripe's standard published US card rate. The exact per-charge fee isn't known
// until the card settles, but grossing up by this rate lands the inspector's
// payout on the invoice balance for the vast majority of US card charges.
const STRIPE_STANDARD_PERCENT = 0.029;
const STRIPE_STANDARD_FIXED = 0.3;

// Round to cents, half up. Plain Math.round(x * 100) / 100 rounds 17.775 down to
// 17.77 because 450 * 0.0395 is 17.774999... in floating point; nudging by a
// tiny epsilon fixes those exact-half cases without moving any other value.
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100 * (1 + Number.EPSILON)) / 100;
}

function getNumber(value: any): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getOnlineProcessingFee(balanceDue: number, company: any): number {
  if (!balanceDue || balanceDue <= 0) return 0;
  if (company?.online_payment_fee_enabled === false) return 0;

  const feeType = String(company?.online_payment_fee_type || "percentage").toLowerCase();

  if (feeType === "stripe_fee") {
    const totalCharged = (balanceDue + STRIPE_STANDARD_FIXED) / (1 - STRIPE_STANDARD_PERCENT);
    return roundCents(totalCharged - balanceDue);
  }

  const amount = getNumber(company?.online_payment_fee_amount);
  if (amount <= 0) return 0;

  if (feeType === "flat") {
    return roundCents(amount);
  }

  // percentage (default) - amount is a percent of the balance due
  return roundCents(balanceDue * (amount / 100));
}
