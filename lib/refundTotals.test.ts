import { describe, it, expect } from "vitest";
import { combineRefunds } from "./refundTotals";

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
