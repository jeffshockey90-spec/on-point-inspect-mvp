import { describe, it, expect } from "vitest";
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
