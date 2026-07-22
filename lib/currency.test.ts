import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdFromCents } from "./currency";

describe("formatUsd", () => {
  it("formats whole dollar amounts", () => {
    expect(formatUsd(69)).toBe("$69");
    expect(formatUsd(550)).toBe("$550");
    expect(formatUsd(0)).toBe("$0");
  });

  it("rounds fractional dollars to the nearest whole dollar", () => {
    expect(formatUsd(69.4)).toBe("$69");
    expect(formatUsd(69.5)).toBe("$70");
  });

  it("adds thousands separators", () => {
    expect(formatUsd(3650)).toBe("$3,650");
  });

  it("falls back to $0 for non-finite input instead of throwing", () => {
    expect(formatUsd(NaN)).toBe("$0");
    expect(formatUsd(Infinity)).toBe("$0");
  });

  it("handles negative amounts (e.g. a refund/credit)", () => {
    expect(formatUsd(-50)).toBe("-$50");
  });
});

describe("formatUsdFromCents", () => {
  it("converts cents to dollars correctly - this is the exact bug class the original audit flagged", () => {
    // 6900 cents is $69, NOT $6,900. Mixing this up was the original risk.
    expect(formatUsdFromCents(6900)).toBe("$69");
    expect(formatUsdFromCents(4900)).toBe("$49");
    expect(formatUsdFromCents(55000)).toBe("$550");
  });

  it("formats zero cents as $0", () => {
    expect(formatUsdFromCents(0)).toBe("$0");
  });

  it("falls back to $0 for non-finite input instead of throwing", () => {
    expect(formatUsdFromCents(NaN)).toBe("$0");
  });

  it("rounds partial cents (sub-dollar remainders) to the nearest whole dollar", () => {
    expect(formatUsdFromCents(6950)).toBe("$70");
    expect(formatUsdFromCents(6949)).toBe("$69");
  });
});
