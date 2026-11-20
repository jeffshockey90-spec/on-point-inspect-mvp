import { describe, it, expect } from "vitest";
import { combineRefunds, manualRefundBlockReason, STRIPE_REFUND_MESSAGE } from "./refundTotals";

describe("combineRefunds", () => {
  it("keeps a manual refund when a Stripe refund arrives later", () => {
    // $100 cash refund recorded, then $50 refunded in Stripe.
    expect(combineRefunds({ existingTotal: 100, previousStripe: 0, stripeCumulative: 50 })).toBe(150);
  });
  it("is idempotent across webhook redeliveries and multiple partial Stripe refunds", () => {
    expect(combineRefunds({ existingTotal: 150, previousStripe: 50, stripeCumulative: 50 })).toBe(150);
    expect(combineRefunds({ existingTotal: 150, previousStripe: 50, stripeCumulative: 80 })).toBe(180);
  });
  it("without the tracking column, never shrinks a larger manual total", () => {
    expect(combineRefunds({ existingTotal: 100, previousStripe: null, stripeCumulative: 50 })).toBe(100);
    expect(combineRefunds({ existingTotal: 20, previousStripe: null, stripeCumulative: 50 })).toBe(50);
  });
});

describe("manualRefundBlockReason", () => {
  it("blocks recording a Stripe refund by hand (the webhook records it)", () => {
    expect(manualRefundBlockReason({ method: "Stripe" })).toBe(STRIPE_REFUND_MESSAGE);
  });

  it("blocks a blank or Card method on a job paid through Stripe", () => {
    expect(manualRefundBlockReason({ method: "", inspectionPaymentMethod: "Stripe" })).toBe(STRIPE_REFUND_MESSAGE);
    expect(manualRefundBlockReason({ method: "Card", inspectionPaymentMethod: "Stripe" })).toBe(STRIPE_REFUND_MESSAGE);
  });

  it("allows money returned another way, even on a Stripe-paid job", () => {
    for (const method of ["Cash", "Check", "Zelle", "Venmo", "ACH", "Other"]) {
      expect(manualRefundBlockReason({ method, inspectionPaymentMethod: "Stripe" })).toBeNull();
    }
  });

  it("allows any method on a job not paid through Stripe", () => {
    expect(manualRefundBlockReason({ method: "", inspectionPaymentMethod: "Cash" })).toBeNull();
    expect(manualRefundBlockReason({ method: "Card", inspectionPaymentMethod: "Card" })).toBeNull();
  });
});
