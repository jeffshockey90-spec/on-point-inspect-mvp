import { describe, expect, it } from "vitest";
import { isPaymentComplete } from "./inspectionStatus";

describe("isPaymentComplete — refunds never re-lock a paid report", () => {
  it("stays complete after a PARTIAL refund (the $155 bug)", () => {
    // $650 invoice paid in full, then $155 refunded. Under the correct model a
    // refund is its own quantity: amount_paid/balance_due are untouched, so the
    // delivered report must stay unlocked — it must NOT show a $155 balance due.
    const inspection = {
      payment_status: "Partial Refund",
      invoice_amount: 650,
      amount_paid: 650,
      balance_due: 0,
      amount_refunded: 155,
      paid_at: "2026-11-10T15:00:00.000Z",
    };
    expect(isPaymentComplete(inspection)).toBe(true);
  });

  it("stays complete (unlocked) after a FULL refund of a delivered report", () => {
    const inspection = {
      payment_status: "Refunded",
      invoice_amount: 650,
      amount_paid: 650,
      balance_due: 0,
      amount_refunded: 650,
      paid_at: "2026-11-10T15:00:00.000Z",
    };
    expect(isPaymentComplete(inspection)).toBe(true);
  });

  it("guards against a stale balance_due left behind by an old refund write", () => {
    // Even if a legacy/stale balance_due is present, a recorded refund on a
    // previously-paid inspection must not re-lock the report.
    const inspection = {
      payment_status: "Partial Refund",
      invoice_amount: 650,
      amount_paid: 495,
      balance_due: 155,
      amount_refunded: 155,
      paid_at: "2026-11-10T15:00:00.000Z",
    };
    expect(isPaymentComplete(inspection)).toBe(true);
  });

  it("does NOT treat a never-paid inspection as complete just because a refund status leaked in", () => {
    const inspection = {
      payment_status: "Refunded",
      invoice_amount: 650,
      amount_paid: 0,
      balance_due: 650,
      amount_refunded: 0,
      paid_at: null,
    };
    expect(isPaymentComplete(inspection)).toBe(false);
  });
});

describe("isPaymentComplete — baseline (unchanged for non-refund cases)", () => {
  it("is complete when fully paid", () => {
    expect(
      isPaymentComplete({ payment_status: "Paid", invoice_amount: 500, amount_paid: 500, balance_due: 0 }),
    ).toBe(true);
  });

  it("is incomplete when unpaid with a balance", () => {
    expect(
      isPaymentComplete({ payment_status: "Unpaid", invoice_amount: 500, amount_paid: 0, balance_due: 500 }),
    ).toBe(false);
  });

  it("is complete when waived", () => {
    expect(
      isPaymentComplete({ payment_status: "Waived", invoice_amount: 500, amount_paid: 0, balance_due: 0 }),
    ).toBe(true);
  });

  it("is complete when no payment fields are tracked at all", () => {
    expect(isPaymentComplete({ id: 1, client_name: "Test" })).toBe(true);
  });
});
