import { describe, expect, it } from "vitest";
import { agreementCompleteFrom, isPaymentComplete } from "./reportDelivery";

describe("payment gate", () => {
  it("locks a job with no price unless the inspector marked it paid / waived / not required", () => {
    expect(isPaymentComplete({ payment_status: "Unpaid", invoice_amount: 0 })).toBe(false);
    expect(isPaymentComplete({ invoice_amount: null })).toBe(false);
    expect(isPaymentComplete({ payment_status: "Waived", invoice_amount: 0 })).toBe(true);
    expect(isPaymentComplete({ payment_status: "Not Required" })).toBe(true);
    expect(isPaymentComplete({ payment_status: "Paid" })).toBe(true);
  });

  it("unlocks when paid in full, stays locked on a partial payment", () => {
    expect(isPaymentComplete({ invoice_amount: 450, amount_paid: 450 })).toBe(true);
    expect(isPaymentComplete({ invoice_amount: 450, amount_paid: 200, balance_due: 250 })).toBe(false);
  });

  it("never re-locks a paid report after a refund", () => {
    expect(
      isPaymentComplete({ payment_status: "Refunded", invoice_amount: 450, amount_paid: 450, amount_refunded: 450, balance_due: 450 }),
    ).toBe(true);
  });
});

describe("agreement gate", () => {
  const base = { waived: false, oneSigner: false, signedOnFile: false };

  it("locks a job with no client on file until an agreement is signed", () => {
    expect(agreementCompleteFrom({ ...base, contacts: [] })).toBe(false);
    expect(agreementCompleteFrom({ ...base, contacts: [{ role: "realtor", agreement_required: true }] })).toBe(false);
    expect(agreementCompleteFrom({ ...base, contacts: [], signedOnFile: true })).toBe(true);
  });

  it("requires the marked signers (or any one with one-signer on)", () => {
    const contacts = [
      { role: "client", agreement_required: true, agreement_signed: true },
      { role: "co-client", agreement_required: true, agreement_signed: false },
    ];
    expect(agreementCompleteFrom({ ...base, contacts })).toBe(false);
    expect(agreementCompleteFrom({ ...base, oneSigner: true, contacts })).toBe(true);
  });

  it("keeps the inspector's choices: waived, or clients marked not required (imports)", () => {
    expect(agreementCompleteFrom({ ...base, waived: true, contacts: [] })).toBe(true);
    expect(agreementCompleteFrom({ ...base, contacts: [{ role: "client", agreement_required: false }] })).toBe(true);
  });
});
