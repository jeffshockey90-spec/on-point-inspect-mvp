import { describe, expect, it } from "vitest";
import { findReplacedAgreementForContact } from "./agreementReplacement";

describe("findReplacedAgreementForContact", () => {
  it("finds the superseded agreement for a contact by contact id", () => {
    const agreements = [
      {
        id: 2,
        contact_id: "c1",
        client_email: "buyer@example.com",
        signed_at: "2026-10-22T18:00:00.000Z",
        status: "signed",
      },
      {
        id: 1,
        contact_id: "c1",
        client_email: "buyer@example.com",
        signed_at: "2026-10-10T18:00:00.000Z",
        status: "superseded",
      },
    ];

    const replaced = findReplacedAgreementForContact(agreements, { id: "c1" });
    expect(replaced?.id).toBe(1);
  });

  it("falls back to matching by email when contact id is missing", () => {
    const agreements = [
      {
        id: 1,
        contact_id: null,
        client_email: "buyer@example.com",
        signed_at: "2026-10-10T18:00:00.000Z",
        status: "superseded",
      },
    ];

    const replaced = findReplacedAgreementForContact(agreements, {
      id: null,
      email: "Buyer@Example.com",
    });
    expect(replaced?.id).toBe(1);
  });

  it("picks the most recent superseded record when there are multiple generations", () => {
    const agreements = [
      {
        id: 1,
        contact_id: "c1",
        signed_at: "2026-09-01T18:00:00.000Z",
        status: "superseded",
      },
      {
        id: 2,
        contact_id: "c1",
        signed_at: "2026-10-01T18:00:00.000Z",
        status: "superseded",
      },
    ];

    const replaced = findReplacedAgreementForContact(agreements, { id: "c1" });
    expect(replaced?.id).toBe(2);
  });

  it("returns null when the contact never had a superseded agreement", () => {
    const agreements = [
      {
        id: 1,
        contact_id: "c1",
        signed_at: "2026-10-22T18:00:00.000Z",
        status: "signed",
      },
    ];

    expect(findReplacedAgreementForContact(agreements, { id: "c1" })).toBeNull();
  });

  it("returns null for an empty or missing agreement list", () => {
    expect(findReplacedAgreementForContact(null, { id: "c1" })).toBeNull();
    expect(findReplacedAgreementForContact([], { id: "c1" })).toBeNull();
  });
});
