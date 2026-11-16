import { describe, expect, it } from "vitest";
import { bookingServicesForQuote, isQuoteOpen, newQuoteToken, normalizeQuoteInput } from "./savedQuotes";

const now = new Date("2026-11-16T12:00:00Z");

describe("normalizeQuoteInput", () => {
  it("requires services and a positive total", () => {
    expect("error" in normalizeQuoteInput({ lineItems: [], total: 400 })).toBe(true);
    expect("error" in normalizeQuoteInput({ lineItems: [{ id: "home", name: "Home", fee: 0 }], total: 0 })).toBe(true);
  });

  it("cleans fields and sets a 30-day expiry", () => {
    const result = normalizeQuoteInput(
      {
        clientEmail: " Buyer@Example.com ",
        state: "md",
        squareFeet: 2400.7,
        lineItems: [{ id: "home", name: "Home Inspection", fee: 450.005 }],
        total: 450,
      },
      now,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.row.client_email).toBe("buyer@example.com");
    expect(result.row.state).toBe("MD");
    expect(result.row.square_feet).toBe(2400);
    expect(result.row.service_ids).toEqual(["home"]);
    expect(result.row.expires_at).toBe("2026-12-16T12:00:00.000Z");
  });

  it("rejects a bad email", () => {
    const result = normalizeQuoteInput({ clientEmail: "nope", lineItems: [{ id: "home", name: "H", fee: 1 }], total: 1 });
    expect("error" in result).toBe(true);
  });
});

describe("bookingServicesForQuote", () => {
  it("maps built-in services to the booking form and keeps custom ones by name", () => {
    expect(
      bookingServicesForQuote(["home", "radon", "pool"], [
        { id: "home", name: "Home" },
        { id: "radon", name: "Radon" },
        { id: "pool", name: "Pool & Spa" },
      ]),
    ).toEqual(["Buyer Home Inspection", "Radon Testing", "Pool & Spa"]);
  });
});

describe("isQuoteOpen / newQuoteToken", () => {
  it("is open only while unbooked and unexpired", () => {
    expect(isQuoteOpen({ status: "open", expires_at: "2026-12-01T00:00:00Z" }, now)).toBe(true);
    expect(isQuoteOpen({ status: "booked" }, now)).toBe(false);
    expect(isQuoteOpen({ status: "open", expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(false);
  });

  it("makes unguessable url-safe tokens", () => {
    const a = newQuoteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newQuoteToken()).not.toBe(a);
  });
});
