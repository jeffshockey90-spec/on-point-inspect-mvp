import { describe, expect, it } from "vitest";
import { getOnlineProcessingFee } from "./onlinePaymentFee";
import { getProcessingFeeLineItem } from "./stripeCheckout";

const stripeFee = { online_payment_fee_type: "stripe_fee" };

describe("getOnlineProcessingFee", () => {
  it("matches real Stripe charges in stripe_fee mode (balance + fee = charged)", () => {
    // Totals actually charged on FLOW jobs, Nov 2026.
    for (const [balance, charged] of [
      [450, 463.75],
      [300, 309.27],
      [500, 515.24],
      [150, 154.79],
      [400, 412.26],
    ]) {
      const fee = getOnlineProcessingFee(balance, stripeFee);
      expect(Math.round((balance + fee) * 100) / 100).toBe(charged);
    }
  });

  it("charges nothing when disabled, for a zero/negative balance, or a zero amount", () => {
    expect(getOnlineProcessingFee(450, { ...stripeFee, online_payment_fee_enabled: false })).toBe(0);
    expect(getOnlineProcessingFee(0, stripeFee)).toBe(0);
    expect(getOnlineProcessingFee(-5, stripeFee)).toBe(0);
    expect(getOnlineProcessingFee(450, { online_payment_fee_type: "flat", online_payment_fee_amount: 0 })).toBe(0);
  });

  it("supports flat and percentage fees, rounded to cents", () => {
    expect(getOnlineProcessingFee(450, { online_payment_fee_type: "flat", online_payment_fee_amount: "$5" })).toBe(5);
    expect(getOnlineProcessingFee(450, { online_payment_fee_type: "percentage", online_payment_fee_amount: 3.95 })).toBe(17.78);
    // percentage is the default type
    expect(getOnlineProcessingFee(100, { online_payment_fee_amount: 3 })).toBe(3);
  });
});

describe("getProcessingFeeLineItem", () => {
  it("builds a cents line item, or nothing for no fee", () => {
    expect(getProcessingFeeLineItem(13.75, stripeFee)).toMatchObject({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: 1375 },
    });
    expect(getProcessingFeeLineItem(0, stripeFee)).toBeNull();
  });
});
