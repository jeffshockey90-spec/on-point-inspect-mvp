import { describe, it, expect } from "vitest";
import { isInvoiceClosed, invoiceStatusLabel } from "./invoiceStatus";

describe("invoice status", () => {
  it("treats paid, refunded and disputed invoices as closed", () => {
    for (const s of ["paid", "Refunded", "partially_refunded", "disputed"]) expect(isInvoiceClosed(s)).toBe(true);
    for (const s of ["draft", "sent", "", null]) expect(isInvoiceClosed(s)).toBe(false);
  });
  it("labels statuses", () => {
    expect(invoiceStatusLabel("partially_refunded")).toBe("Partially refunded");
    expect(invoiceStatusLabel("disputed")).toBe("Disputed");
  });
});
