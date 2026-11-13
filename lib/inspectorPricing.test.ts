import { describe, it, expect } from "vitest";
import {
  calculateMultiUnitPrice,
  multiUnitSizeFee,
  hasMultiUnitPricing,
  type PricingService,
} from "./inspectorPricing";

const baseHome: PricingService = {
  id: "home",
  name: "Home Inspection",
  type: "sqft_formula",
  isBaseService: true,
  basePrice: 450,
  baseSqftLimit: 2000,
  incrementPrice: 50,
  incrementSqftBlock: 1000,
};

describe("hasMultiUnitPricing", () => {
  it("is false when no per-unit fee is configured", () => {
    expect(hasMultiUnitPricing(baseHome)).toBe(false);
    expect(hasMultiUnitPricing({ ...baseHome, multiUnitBaseFee: 350 })).toBe(false);
  });

  it("is false for a zero or negative per-unit fee (treated as not set up)", () => {
    expect(hasMultiUnitPricing({ ...baseHome, multiUnitPerUnitFee: 0 })).toBe(false);
    expect(hasMultiUnitPricing({ ...baseHome, multiUnitPerUnitFee: -10 })).toBe(false);
  });

  it("is true once a positive per-unit fee is set (base fee may be 0)", () => {
    expect(hasMultiUnitPricing({ ...baseHome, multiUnitPerUnitFee: 200 })).toBe(true);
    expect(
      hasMultiUnitPricing({ ...baseHome, multiUnitBaseFee: 0, multiUnitPerUnitFee: 200 }),
    ).toBe(true);
  });

  it("is false for null/undefined", () => {
    expect(hasMultiUnitPricing(null)).toBe(false);
    expect(hasMultiUnitPricing(undefined)).toBe(false);
  });
});

describe("calculateMultiUnitPrice — base building fee + per-unit × units", () => {
  const svc: PricingService = { ...baseHome, multiUnitBaseFee: 350, multiUnitPerUnitFee: 200 };

  it("prices a duplex as base + 2 units", () => {
    expect(calculateMultiUnitPrice(svc, 2)).toBe(750);
  });

  it("prices a triplex and fourplex", () => {
    expect(calculateMultiUnitPrice(svc, 3)).toBe(950);
    expect(calculateMultiUnitPrice(svc, 4)).toBe(1150);
  });

  it("treats a missing base building fee as 0", () => {
    expect(calculateMultiUnitPrice({ ...baseHome, multiUnitPerUnitFee: 200 }, 2)).toBe(400);
  });

  it("floors units to a minimum of 1 so a bad count never zeroes the base", () => {
    expect(calculateMultiUnitPrice(svc, 0)).toBe(550);
    expect(calculateMultiUnitPrice(svc, Number.NaN)).toBe(550);
    expect(calculateMultiUnitPrice(svc, 2.9)).toBe(750);
  });

  it("does not use the single-family sqft formula fields", () => {
    // basePrice/incrementPrice are ignored — only the multi-unit fields matter.
    expect(calculateMultiUnitPrice(svc, 2)).toBe(350 + 200 * 2);
  });
});

describe("multiUnitSizeFee — per-unit size step for large buildings", () => {
  const sized: PricingService = {
    ...baseHome,
    multiUnitBaseFee: 350,
    multiUnitPerUnitFee: 200,
    multiUnitSqftLimit: 1500, // per unit
    multiUnitIncrementPrice: 50,
    multiUnitIncrementSqftBlock: 1000,
  };

  it("is 0 when the size step is not configured", () => {
    expect(multiUnitSizeFee({ ...baseHome, multiUnitPerUnitFee: 200 }, 9000, 2)).toBe(0);
  });

  it("scales the allowance by unit count (1500/unit)", () => {
    // Duplex allowance = 3000; triplex = 4500.
    expect(multiUnitSizeFee(sized, 3000, 2)).toBe(0);
    expect(multiUnitSizeFee(sized, 4500, 3)).toBe(0);
    // A normal fourplex (4 × ~900 = 3600) is well under its 6000 allowance.
    expect(multiUnitSizeFee(sized, 3600, 4)).toBe(0);
  });

  it("charges per block (rounded up) over the scaled allowance", () => {
    expect(multiUnitSizeFee(sized, 4000, 2)).toBe(50); // duplex, 1000 over 3000
    expect(multiUnitSizeFee(sized, 5000, 2)).toBe(100); // duplex, 2000 over
    expect(multiUnitSizeFee(sized, 3100, 2)).toBe(50); // partial block rounds up
  });

  it("adds the size step on top of the per-door price", () => {
    // Normal duplex (≤ allowance) stays at base + per-unit.
    expect(calculateMultiUnitPrice(sized, 2, 2800)).toBe(750);
    // Large duplex: 5000 sqft total -> +$100.
    expect(calculateMultiUnitPrice(sized, 2, 5000)).toBe(850);
  });

  it("requires both an increment price and a block size", () => {
    expect(multiUnitSizeFee({ ...sized, multiUnitIncrementSqftBlock: 0 }, 9000, 2)).toBe(0);
    expect(multiUnitSizeFee({ ...sized, multiUnitIncrementPrice: 0 }, 9000, 2)).toBe(0);
  });
});
