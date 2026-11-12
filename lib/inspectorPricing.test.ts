import { describe, expect, it } from "vitest";
import {
  calculateServiceFee,
  DEFAULT_PRICING_CONFIG,
  getBaseService,
  getService,
} from "./inspectorPricing";

/**
 * Multi-family quoting. The numbers here are a real job: 422 N Locust St,
 * Hagerstown — a 2,580 sq ft two-unit built in 1910 — so a change to the
 * default sheet that silently moves a quote shows up as a failing test rather
 * than as an underbid.
 */
describe("multi-family pricing", () => {
  const base = getBaseService(DEFAULT_PRICING_CONFIG)!;
  const additional = getService(DEFAULT_PRICING_CONFIG, "additional_units")!;

  const quote = (sqft: number, units: number) =>
    calculateServiceFee(base, { sqft }) +
    calculateServiceFee(additional, { units: Math.max(0, units - 1) });

  it("prices a 2,580 sq ft duplex at 750", () => {
    // 500 base + 50 for the part-block over 2,000, plus one extra dwelling.
    expect(quote(2580, 2)).toBe(750);
  });

  it("charges nothing extra on a single-family", () => {
    expect(quote(2580, 1)).toBe(550);
    expect(calculateServiceFee(additional, { units: 0 })).toBe(0);
  });

  it("stacks per dwelling, not per square foot", () => {
    // Same building size, more units: each extra dwelling is its own kitchen,
    // baths and often its own mechanicals.
    expect(quote(2000, 2)).toBe(700);
    expect(quote(2000, 3)).toBe(900);
    expect(quote(2000, 4)).toBe(1100);
  });

  it("still scales with building size on a fourplex", () => {
    expect(quote(4000, 4)).toBe(1200);
  });

  it("rounds a part-block of square footage up", () => {
    expect(calculateServiceFee(base, { sqft: 2001 })).toBe(550);
    expect(calculateServiceFee(base, { sqft: 3000 })).toBe(550);
    expect(calculateServiceFee(base, { sqft: 3001 })).toBe(600);
  });
});
