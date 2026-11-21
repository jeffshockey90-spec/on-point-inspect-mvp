// Decides how a completed Stripe checkout session updates an inspection's
// payment fields. Shared by the payment-success page and the Stripe webhook,
// which both process the same session.
//
// Rules (each fixes a real bug):
//   - A session already recorded on the inspection is not applied again, so a
//     revisited/bookmarked success page or a re-delivered webhook can't redo it.
//     "Recorded" means this session's payment was applied (its payment intent
//     is stored), NOT merely that the session id is on the row: creating a
//     checkout already stores the new session id, so matching on the id alone
//     skipped every real payment (Nov 16-20, 2026 regression).
//   - A refunded / partially refunded / disputed inspection is never flipped
//     back to "Paid".
//   - A payment applied EARLIER (an older checkout link reopened after a newer
//     payment replaced the row's session/intent) is not applied again either:
//     callers look it up in the payment ledger (lib/paymentLedger) and pass
//     appliedBefore. The row only remembers the latest payment.
//   - amount_paid grows by what THIS session actually collected; it used to be
//     set to the full invoice, so paying an old $500 link on a $650 invoice
//     recorded $650 paid / $0 due. The status is "Paid" only when nothing is
//     left owing, otherwise "Partial" with the real remaining balance.

export type ExistingPaymentRow = {
  amount_paid?: unknown;
  invoice_amount?: unknown;
  total_price?: unknown;
  total?: unknown;
  price?: unknown;
  payment_status?: unknown;
  invoice_status?: unknown;
  paid_at?: unknown;
  stripe_checkout_session_id?: unknown;
  stripe_payment_intent_id?: unknown;
  payment_notes?: unknown;
} | null | undefined;

export type PaymentRecordDecision =
  | { apply: false; reason: "session_already_recorded" | "refunded_or_disputed" }
  | {
      apply: true;
      status: "Paid" | "Partial";
      amountPaid: number;
      balanceDue: number;
      paidAt: string | null;
      fullyPaid: boolean;
    };

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function decidePaymentRecord(input: {
  existing: ExistingPaymentRow;
  sessionId: string;
  /** The session's payment intent id, when Stripe returned one. */
  paymentIntentId?: string | null;
  /** Inspection balance this session collected (excludes the online fee). */
  balancePaid: number;
  /** The payment ledger already has this session/intent applied to this inspection. */
  appliedBefore?: boolean;
  now?: string;
}): PaymentRecordDecision {
  const existing = input.existing || {};
  const status = String(existing.payment_status || existing.invoice_status || "").toLowerCase();
  if (status.includes("refund") || status.includes("disput")) {
    return { apply: false, reason: "refunded_or_disputed" };
  }
  if (input.appliedBefore) return { apply: false, reason: "session_already_recorded" };
  if (input.sessionId && String(existing.stripe_checkout_session_id || "") === input.sessionId) {
    // Applying a payment stores its payment intent (and a "Session: <id>" note);
    // opening a checkout stores only the session id. Skip only the former.
    const recordedIntent = String(existing.stripe_payment_intent_id || "");
    const alreadyApplied = input.paymentIntentId
      ? recordedIntent === input.paymentIntentId
      : String(existing.payment_notes || "").includes(`Session: ${input.sessionId}`);
    if (alreadyApplied) return { apply: false, reason: "session_already_recorded" };
  }

  const priorPaid = num(existing.amount_paid);
  const invoice = num(existing.invoice_amount ?? existing.total_price ?? existing.total ?? existing.price);
  const amountPaid = round2(priorPaid + Math.max(0, num(input.balancePaid)));
  const balanceDue = invoice > 0 ? Math.max(0, round2(invoice - amountPaid)) : 0;
  const fullyPaid = balanceDue <= 0.009;
  const existingPaidAt = existing.paid_at ? String(existing.paid_at) : null;

  return {
    apply: true,
    status: fullyPaid ? "Paid" : "Partial",
    amountPaid,
    balanceDue: fullyPaid ? 0 : balanceDue,
    paidAt: fullyPaid ? existingPaidAt || input.now || new Date().toISOString() : existingPaidAt,
    fullyPaid,
  };
}
