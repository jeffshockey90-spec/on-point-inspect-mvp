import { describe, it, expect } from "vitest";
import { isPaymentSettled, isPaymentWaived } from "./paymentSettled";

describe("isPaymentSettled", () => {
  it("treats paid, waived and refunded jobs as owing nothing", () => {
    for (const s of ["Paid", "Waived", "Not Required", "Refunded", "Partial Refund", "Disputed"]) {
      expect(isPaymentSettled({ payment_status: s })).toBe(true);
    }
  });
  it("still collects on unpaid and partial jobs", () => {
    for (const s of ["Unpaid", "Partial", "", undefined]) expect(isPaymentSettled({ payment_status: s })).toBe(false);
  });
  it("detects waived", () => {
    expect(isPaymentWaived({ invoice_status: "Waived" })).toBe(true);
    expect(isPaymentWaived({ payment_status: "Paid" })).toBe(false);
  });
});

import { effectivePaymentStatus, paidWithBalanceRemaining } from "./paymentSettled";
import { isPaymentComplete } from "./reportDelivery";

describe("price raised after payment", () => {
  const row = { payment_status: "Paid", invoice_amount: 400, amount_paid: 300, balance_due: 0 };
  it("is a partial payment with a balance due, not settled", () => {
    expect(paidWithBalanceRemaining(row)).toBe(true);
    expect(isPaymentSettled(row)).toBe(false);
    expect(isPaymentComplete(row)).toBe(false);
    expect(effectivePaymentStatus("Paid", 400, 300)).toBe("Partial");
  });
  it("leaves real paid / waived / hand-marked jobs alone", () => {
    expect(isPaymentSettled({ payment_status: "Paid", invoice_amount: 400, amount_paid: 400 })).toBe(true);
    expect(isPaymentSettled({ payment_status: "Paid", invoice_amount: 400 })).toBe(true);
    expect(isPaymentSettled({ payment_status: "Waived", invoice_amount: 400, amount_paid: 0 })).toBe(true);
    expect(effectivePaymentStatus("Waived", 400, 100)).toBe("Waived");
  });
});
