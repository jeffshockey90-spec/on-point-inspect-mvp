import { describe, expect, it } from "vitest";
import { calculateMultiUnitPrice, createCustomService, hasMultiUnitPricing, calculateServiceFee } from "./inspectorPricing";

describe("custom square-footage service with multi-family pricing", () => {
  const preListing = {
    ...createCustomService("sqft_formula"),
    name: "Pre-Listing Inspection",
    basePrice: 400,
    baseSqftLimit: 2000,
    incrementPrice: 50,
    incrementSqftBlock: 1000,
    multiUnitBaseFee: 300,
    multiUnitPerUnitFee: 175,
    multiUnitSqftLimit: 1500,
    multiUnitIncrementPrice: 50,
    multiUnitIncrementSqftBlock: 1000,
  };

  it("prices single-family by its own square-footage formula", () => {
    expect(calculateServiceFee(preListing, { sqft: 3000 })).toBe(450);
  });

  it("prices a duplex per door with its own rates", () => {
    expect(hasMultiUnitPricing(preListing)).toBe(true);
    expect(calculateMultiUnitPrice(preListing, 2, 2800)).toBe(300 + 175 * 2);
    // 4 units x 1500 allowance = 6000; 8000 sqft is 2000 over -> +$100
    expect(calculateMultiUnitPrice(preListing, 4, 8000)).toBe(300 + 175 * 4 + 100);
  });
});
