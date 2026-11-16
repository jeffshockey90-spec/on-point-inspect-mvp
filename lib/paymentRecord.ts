// Decides how a completed Stripe checkout session updates an inspection's
// payment fields. Shared by the payment-success page and the Stripe webhook,
// which both process the same session.
//
// Rules (each fixes a real bug):
//   - A session already recorded on the inspection is not applied again, so a
//     revisited/bookmarked success page or a re-delivered webhook can't redo it.
//   - A refunded / partially refunded / disputed inspection is never flipped
//     back to "Paid".
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
  /** Inspection balance this session collected (excludes the online fee). */
  balancePaid: number;
  now?: string;
}): PaymentRecordDecision {
  const existing = input.existing || {};
  const status = String(existing.payment_status || existing.invoice_status || "").toLowerCase();
  if (status.includes("refund") || status.includes("disput")) {
    return { apply: false, reason: "refunded_or_disputed" };
  }
  if (input.sessionId && String(existing.stripe_checkout_session_id || "") === input.sessionId) {
    return { apply: false, reason: "session_already_recorded" };
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
