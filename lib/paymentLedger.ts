// Payment ledger: which Stripe checkout payments have already been applied to an
// inspection. The inspections row only remembers the LATEST payment's session
// and intent, so without this an older checkout link reopened after a newer
// payment (or a late webhook for it) would add its amount a second time.
//
// Rows live in stripe_logs (no schema change):
//   - "payment_applied": written by the success page and the webhook right
//     after they successfully update the inspection.
//   - "payment_completed": the webhook's existing log, also written only after
//     a successful update, so payments from before this ledger still count.
// "payment_success_page_verified" is NOT used: it could be written even when
// the update itself failed, and treating that as applied would lose a payment.

export const PAYMENT_APPLIED_STATUS = "payment_applied";
const APPLIED_STATUSES = [PAYMENT_APPLIED_STATUS, "payment_completed"];

type LedgerRow = { payment_intent_id?: string | null; metadata?: any };

/** Pure check, exported for tests. */
export function ledgerHasPayment(
  rows: LedgerRow[] | null | undefined,
  sessionId: string,
  paymentIntentId: string | null | undefined,
): boolean {
  return (rows || []).some(
    (row) =>
      (paymentIntentId && row?.payment_intent_id === paymentIntentId) ||
      (sessionId && String(row?.metadata?.sessionId || "") === sessionId),
  );
}

export async function paymentAppliedBefore(
  supabase: any,
  inspectionId: number | string,
  sessionId: string,
  paymentIntentId: string | null | undefined,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stripe_logs")
    .select("payment_intent_id, metadata")
    .eq("inspection_id", Number(inspectionId))
    .in("status", APPLIED_STATUSES);
  // If the ledger can't be read, fall back to the row-based check alone
  // (the previous behaviour) rather than refusing to record a real payment.
  if (error) {
    console.error("Payment ledger read failed:", error);
    return false;
  }
  return ledgerHasPayment(data, sessionId, paymentIntentId);
}

export async function recordPaymentApplied(
  supabase: any,
  entry: {
    inspectionId: number | string;
    sessionId: string;
    paymentIntentId: string | null | undefined;
    balancePaid: number;
    source: "payment_success_page" | "stripe_webhook";
  },
): Promise<void> {
  const { error } = await supabase.from("stripe_logs").insert({
    inspection_id: Number(entry.inspectionId),
    payment_intent_id: entry.paymentIntentId || null,
    amount: entry.balancePaid,
    status: PAYMENT_APPLIED_STATUS,
    metadata: { sessionId: entry.sessionId, source: entry.source },
  });
  if (error) console.error("Payment ledger write failed:", error);
}
