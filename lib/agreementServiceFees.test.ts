import { describe, it, expect } from "vitest";
import { deriveServiceFees, deriveAgreementServiceFees } from "./agreementTemplates";

const sum = (map: Record<string, any>) =>
  Object.values(map).reduce((total, value) => total + (Number(value) || 0), 0);

describe("deriveAgreementServiceFees", () => {
  it("folds a discount onto the home line so the agreement total matches what is paid", () => {
    // $500 home base, $50 discount -> client pays $450.
    const inspection = {
      service_fees: { home_inspection: 500 },
      discount: 50,
      invoice_amount: 450,
    };
    // The clean base map (receipt) still shows the $500 base.
    expect(deriveServiceFees(inspection).home_inspection).toBe(500);
    // The agreement map folds the discount onto home.
    const agreement = deriveAgreementServiceFees(inspection);
    expect(agreement.home_inspection).toBe(450);
    expect(sum(agreement)).toBe(450);
  });

  it("folds a fuel/travel fee onto the home line", () => {
    // $400 home base + $35 travel -> client pays $435.
    const inspection = {
      service_fees: { home_inspection: 400 },
      travel_fee: 35,
      invoice_amount: 435,
    };
    const agreement = deriveAgreementServiceFees(inspection);
    expect(agreement.home_inspection).toBe(435);
    expect(sum(agreement)).toBe(435);
  });

  it("keeps add-on service bases and rolls the adjustment onto home only", () => {
    // Home $500 + Radon $175, $50 discount -> pays $625.
    const inspection = {
      service_fees: { home_inspection: 500, radon: 175 },
      discount: 50,
      invoice_amount: 625,
    };
    const agreement = deriveAgreementServiceFees(inspection);
    expect(agreement.radon).toBe(175); // add-on base unchanged
    expect(agreement.home_inspection).toBe(450); // 500 - 50
    expect(sum(agreement)).toBe(625);
  });

  it("rolls the adjustment onto the highest-priced service when there is no home", () => {
    // Mechanical & Structural $450 + Radon $175, $25 discount -> pays $600.
    const inspection = {
      service_fees: { mechanical_and_structural: 450, radon: 175 },
      discount: 25,
      invoice_amount: 600,
    };
    const agreement = deriveAgreementServiceFees(inspection);
    expect(agreement.radon).toBe(175);
    expect(agreement.mechanical_and_structural).toBe(425); // 450 - 25
    expect(sum(agreement)).toBe(600);
  });

  it("leaves a single-service job with no saved service_fees untouched (home already equals total)", () => {
    // Legacy path: no service_fees map, home line = full invoice total.
    const inspection = { invoice_amount: 450 };
    const agreement = deriveAgreementServiceFees(inspection);
    expect(agreement.home).toBe(450);
    expect(sum(agreement)).toBe(450);
  });

  it("does not adjust when there are no fees and no invoice total", () => {
    const agreement = deriveAgreementServiceFees({ service_fees: { home_inspection: 300 } });
    // invoice_amount missing/0 -> leave the base map as-is.
    expect(agreement.home_inspection).toBe(300);
  });

  it("never produces a negative fee when a discount exceeds the primary base", () => {
    const inspection = {
      service_fees: { home_inspection: 100, radon: 175 },
      discount: 200,
      invoice_amount: 75,
    };
    const agreement = deriveAgreementServiceFees(inspection);
    expect(Number(agreement.home_inspection)).toBeGreaterThanOrEqual(0);
  });
});
