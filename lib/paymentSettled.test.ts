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
