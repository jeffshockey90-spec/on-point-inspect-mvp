import { describe, it, expect } from "vitest";
import { ledgerHasPayment } from "./paymentLedger";
import { decidePaymentRecord } from "./paymentRecord";

const now = "2026-11-16T12:00:00.000Z";

describe("decidePaymentRecord", () => {
  it("marks a normal full payment Paid", () => {
    const d = decidePaymentRecord({ existing: { invoice_amount: 500, amount_paid: 0 }, sessionId: "cs_1", balancePaid: 500, now });
    expect(d).toEqual({ apply: true, status: "Paid", amountPaid: 500, balanceDue: 0, paidAt: now, fullyPaid: true });
  });

  it("keeps an earlier offline partial payment", () => {
    const d = decidePaymentRecord({ existing: { invoice_amount: 500, amount_paid: 100 }, sessionId: "cs_1", balancePaid: 400, now });
    expect(d).toMatchObject({ apply: true, status: "Paid", amountPaid: 500, balanceDue: 0 });
  });

  it("records an OLD link paid against a grown invoice as Partial with the real balance", () => {
    // Link created for $500, inspector then added radon (invoice $650).
    const d = decidePaymentRecord({ existing: { invoice_amount: 650, amount_paid: 0 }, sessionId: "cs_old", balancePaid: 500, now });
    expect(d).toEqual({ apply: true, status: "Partial", amountPaid: 500, balanceDue: 150, paidAt: null, fullyPaid: false });
  });

  it("never re-applies a session already recorded (revisited success page / re-delivered webhook)", () => {
    const d = decidePaymentRecord({
      existing: {
        invoice_amount: 500,
        amount_paid: 500,
        payment_status: "Paid",
        stripe_checkout_session_id: "cs_1",
        stripe_payment_intent_id: "pi_1",
      },
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
      balancePaid: 500,
      now,
    });
    expect(d).toEqual({ apply: false, reason: "session_already_recorded" });
  });

  it("applies a payment whose session id was stored when the checkout was OPENED", () => {
    // createInspectionCheckoutSession writes stripe_checkout_session_id and
    // "Pending" before the client pays. That must not count as recorded.
    const d = decidePaymentRecord({
      existing: { invoice_amount: 500, amount_paid: 0, payment_status: "Pending", stripe_checkout_session_id: "cs_1" },
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
      balancePaid: 500,
      now,
    });
    expect(d).toEqual({ apply: true, status: "Paid", amountPaid: 500, balanceDue: 0, paidAt: now, fullyPaid: true });
  });

  it("applies a new checkout even when an earlier payment's intent is still on the row", () => {
    const d = decidePaymentRecord({
      existing: {
        invoice_amount: 650,
        amount_paid: 500,
        payment_status: "Pending",
        stripe_checkout_session_id: "cs_2",
        stripe_payment_intent_id: "pi_1",
      },
      sessionId: "cs_2",
      paymentIntentId: "pi_2",
      balancePaid: 150,
      now,
    });
    expect(d).toMatchObject({ apply: true, status: "Paid", amountPaid: 650, balanceDue: 0 });
  });

  it("without a payment intent, treats the session as recorded only if its note was written", () => {
    const opened = decidePaymentRecord({
      existing: { invoice_amount: 500, stripe_checkout_session_id: "cs_1", payment_notes: "Stripe checkout opened as direct charge." },
      sessionId: "cs_1",
      balancePaid: 500,
      now,
    });
    expect(opened).toMatchObject({ apply: true });
    const recorded = decidePaymentRecord({
      existing: { invoice_amount: 500, amount_paid: 500, stripe_checkout_session_id: "cs_1", payment_notes: "Stripe payment completed. Session: cs_1." },
      sessionId: "cs_1",
      balancePaid: 500,
      now,
    });
    expect(recorded).toEqual({ apply: false, reason: "session_already_recorded" });
  });

  it("never flips a refunded or disputed job back to Paid", () => {
    for (const status of ["Refunded", "Partial Refund", "Disputed"]) {
      const d = decidePaymentRecord({ existing: { invoice_amount: 500, payment_status: status }, sessionId: "cs_new", balancePaid: 500, now });
      expect(d).toEqual({ apply: false, reason: "refunded_or_disputed" });
    }
  });

  it("keeps the original paid_at and handles an unpriced job", () => {
    const d = decidePaymentRecord({ existing: { amount_paid: 0, paid_at: "2026-01-01T00:00:00Z" }, sessionId: "cs_2", balancePaid: 75, now });
    expect(d).toMatchObject({ status: "Paid", amountPaid: 75, balanceDue: 0, paidAt: "2026-01-01T00:00:00Z" });
  });
});

describe("older checkout link reopened after a newer payment", () => {
  // $650 job: $300 paid on link A, then $350 on link B. The row now only
  // remembers B. Reopening A's success page must not add $300 again.
  const afterB = {
    amount_paid: 650,
    invoice_amount: 650,
    payment_status: "Paid",
    paid_at: "2026-11-21T15:00:00Z",
    stripe_checkout_session_id: "cs_B",
    stripe_payment_intent_id: "pi_B",
  };

  it("is applied again when only the row is checked (the old bug)", () => {
    const d = decidePaymentRecord({ existing: afterB, sessionId: "cs_A", paymentIntentId: "pi_A", balancePaid: 300 });
    expect(d.apply).toBe(true);
  });

  it("is skipped when the ledger shows A was already applied", () => {
    const appliedBefore = ledgerHasPayment(
      [
        { payment_intent_id: "pi_A", metadata: { sessionId: "cs_A" } },
        { payment_intent_id: "pi_B", metadata: { sessionId: "cs_B" } },
      ],
      "cs_A",
      "pi_A",
    );
    expect(appliedBefore).toBe(true);
    const d = decidePaymentRecord({ existing: afterB, sessionId: "cs_A", paymentIntentId: "pi_A", balancePaid: 300, appliedBefore });
    expect(d).toEqual({ apply: false, reason: "session_already_recorded" });
  });

  it("matches by session id when Stripe returned no payment intent", () => {
    expect(ledgerHasPayment([{ payment_intent_id: null, metadata: { sessionId: "cs_A" } }], "cs_A", null)).toBe(true);
  });

  it("still applies a genuinely new payment", () => {
    const appliedBefore = ledgerHasPayment([{ payment_intent_id: "pi_A", metadata: { sessionId: "cs_A" } }], "cs_C", "pi_C");
    expect(appliedBefore).toBe(false);
    const d = decidePaymentRecord({
      existing: { ...afterB, amount_paid: 300, payment_status: "Partial", paid_at: null },
      sessionId: "cs_C",
      paymentIntentId: "pi_C",
      balancePaid: 350,
      appliedBefore,
    });
    expect(d).toMatchObject({ apply: true, status: "Paid", amountPaid: 650, balanceDue: 0 });
  });

  it("does not treat empty ids as a match", () => {
    expect(ledgerHasPayment([{ payment_intent_id: null, metadata: {} }], "", null)).toBe(false);
  });
});
