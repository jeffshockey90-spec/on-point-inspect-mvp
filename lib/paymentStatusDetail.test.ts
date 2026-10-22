import { describe, expect, it } from "vitest";
import { getPaymentStatusDetail } from "./paymentStatusDetail";

describe("getPaymentStatusDetail", () => {
  it("shows online payment when the client paid via Stripe", () => {
    const detail = getPaymentStatusDetail({
      payment_status: "Paid",
      payment_method: "Stripe",
      paid_at: "2026-10-22T18:30:00.000Z",
    });
    expect(detail).toBe("Paid by client online on Oct 22, 2026");
  });

  it("shows manual payment with the chosen method when marked paid by hand", () => {
    const detail = getPaymentStatusDetail({
      payment_status: "Paid",
      payment_method: "Check",
      paid_at: "2026-10-22T18:30:00.000Z",
    });
    expect(detail).toBe("Manually marked paid by Check on Oct 22, 2026");
  });

  it("shows manual payment without a method when none was selected", () => {
    const detail = getPaymentStatusDetail({
      payment_status: "Paid",
      payment_method: null,
      paid_at: "2026-10-22T18:30:00.000Z",
    });
    expect(detail).toBe("Manually marked paid on Oct 22, 2026");
  });

  it("shows waived with the date it was waived", () => {
    const detail = getPaymentStatusDetail({
      payment_status: "Waived",
      payment_method: null,
      paid_at: "2026-10-22T18:30:00.000Z",
    });
    expect(detail).toBe("Waived on Oct 22, 2026");
  });

  it("falls back to invoice_status when payment_status is missing", () => {
    const detail = getPaymentStatusDetail({
      invoice_status: "Paid",
      payment_method: "Stripe",
      paid_at: "2026-10-22T18:30:00.000Z",
    });
    expect(detail).toBe("Paid by client online on Oct 22, 2026");
  });

  it("returns null when there is no paid_at timestamp", () => {
    expect(getPaymentStatusDetail({ payment_status: "Paid", payment_method: "Cash" })).toBeNull();
  });

  it("returns null for an unpaid inspection", () => {
    expect(getPaymentStatusDetail({ payment_status: "Unpaid" })).toBeNull();
  });

  it("returns null for a partial payment (no event date to attribute)", () => {
    expect(
      getPaymentStatusDetail({ payment_status: "Partial", paid_at: "2026-10-22T18:30:00.000Z" }),
    ).toBeNull();
  });
});
