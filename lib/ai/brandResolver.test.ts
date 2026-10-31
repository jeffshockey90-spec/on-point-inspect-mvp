import { describe, it, expect } from "vitest";
import { resolveDaikinFamilyBrand } from "./brandResolver";

describe("resolveDaikinFamilyBrand", () => {
  // Regression: the live camera read the data plate's legal manufacturer
  // ("Daikin Comfort Technologies Manufacturing") and labeled a Goodman furnace
  // "Daikin". The field tool read the unit's Goodman logo and got it right. The
  // model-number prefix (GM…) resolves the real brand regardless of which text
  // the vision model happened to read.
  it("corrects the Daikin parent entity to Goodman via a GM… model", () => {
    expect(
      resolveDaikinFamilyBrand("Daikin Comfort Technologies", "GM9S960603BNAB"),
    ).toBe("Goodman");
    expect(resolveDaikinFamilyBrand("Daikin", "GM9S960603BNAB")).toBe("Goodman");
  });

  it("resolves Amana from an A… model", () => {
    expect(resolveDaikinFamilyBrand("Daikin", "ASXC603610")).toBe("Amana");
  });

  it("keeps a genuine Daikin-branded unit (D… model) as Daikin", () => {
    expect(resolveDaikinFamilyBrand("Daikin", "DM96VC0603BN")).toBe("Daikin");
    expect(resolveDaikinFamilyBrand("Daikin Comfort Technologies", "DX13SA0361")).toBe(
      "Daikin",
    );
  });

  it("leaves a correctly-read Goodman brand untouched", () => {
    expect(resolveDaikinFamilyBrand("Goodman", "GM9S960603BNAB")).toBe("Goodman");
  });

  it("does not touch manufacturers outside the Daikin family", () => {
    expect(resolveDaikinFamilyBrand("Carrier", "59TP6A080E17")).toBe("Carrier");
    expect(resolveDaikinFamilyBrand("Rheem", "G100-200")).toBe("Rheem");
    expect(resolveDaikinFamilyBrand("Trane", "A4AC6036")).toBe("Trane");
  });

  it("keeps the read brand when the model is unknown or has no letter prefix", () => {
    expect(resolveDaikinFamilyBrand("Daikin", "Unknown")).toBe("Daikin");
    expect(resolveDaikinFamilyBrand("Daikin", "")).toBe("Daikin");
    expect(resolveDaikinFamilyBrand("Daikin", "2403278458")).toBe("Daikin");
  });

  it("handles empty/blank manufacturer input safely", () => {
    expect(resolveDaikinFamilyBrand("", "GM9S960603BNAB")).toBe("");
  });
});
