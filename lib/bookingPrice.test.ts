import { describe, it, expect } from "vitest";
import { priceBooking, loadEffectivePricing } from "./bookingPrice";
import { DEFAULT_PRICING_CONFIG, type InspectorPricingConfig } from "./inspectorPricing";

describe("priceBooking", () => {
  it("matches the old hardcoded numbers on the platform default", () => {
    expect(priceBooking(DEFAULT_PRICING_CONFIG, { sqft: 1800, home: true, radon: true, mold: true })).toEqual({
      home: 500,
      radon: 175,
      mold: 175,
      total: 850,
    });
    expect(priceBooking(DEFAULT_PRICING_CONFIG, { sqft: 3500, home: true, radon: false, mold: false }).total).toBe(600);
    expect(priceBooking(DEFAULT_PRICING_CONFIG, { sqft: 0, home: false, radon: true, mold: false }).total).toBe(225);
  });

  it("uses the company's own prices", () => {
    const custom: InspectorPricingConfig = {
      services: [
        { id: "home", name: "Home", type: "sqft_formula", isBaseService: true, basePrice: 395, baseSqftLimit: 1500, incrementPrice: 25, incrementSqftBlock: 500 },
        { id: "radon", name: "Radon", type: "flat", flatPrice: 150, pairedPrice: 120 },
      ],
    };
    expect(priceBooking(custom, { sqft: 2000, home: true, radon: true, mold: true })).toEqual({
      home: 420,
      radon: 120,
      mold: 0, // company offers no mold service
      total: 540,
    });
  });
});

describe("loadEffectivePricing", () => {
  const custom = { services: [{ id: "home", name: "Home", type: "flat", flatPrice: 300 }] };
  function db(tables: Record<string, any>) {
    return {
      from(t: string) {
        const q: any = { select: () => q, eq: () => q, not: () => q, limit: () => q, maybeSingle: async () => ({ data: tables[t] ?? null }) };
        return q;
      },
    };
  }

  it("prefers the personal override", async () => {
    const cfg = await loadEffectivePricing(db({ inspector_pricing: { config: custom } }), "u");
    expect(cfg.services.find((s) => s.id === "home")?.flatPrice).toBe(300);
  });

  it("falls back to the company sheet, then the platform default", async () => {
    const viaCompany = await loadEffectivePricing(
      db({ company_users: { company_id: 9 }, company_pricing: { config: custom } }),
      "u",
    );
    expect(viaCompany.services.find((s) => s.id === "home")?.flatPrice).toBe(300);
    const viaDefault = await loadEffectivePricing(db({}), "u");
    expect(viaDefault.services.find((s) => s.id === "home")?.basePrice).toBe(500);
  });
});
