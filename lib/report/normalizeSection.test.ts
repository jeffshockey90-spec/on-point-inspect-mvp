import { describe, it, expect } from "vitest";
import { normalizeSection, DEFAULT_SECTION } from "./normalizeSection";

// Characterization tests: pins the exact behavior that was inlined identically in
// the builder, share, print, and client-portal pages (and, for every real input,
// the PDF route), so unifying all five is provably behavior-preserving.

describe("normalizeSection", () => {
  it("falls back to the default for nullish/empty", () => {
    expect(normalizeSection(null)).toBe(DEFAULT_SECTION);
    expect(normalizeSection(undefined)).toBe(DEFAULT_SECTION);
    expect(normalizeSection("")).toBe(DEFAULT_SECTION);
  });

  it("maps legacy/aliased names to the canonical section", () => {
    expect(normalizeSection("General")).toBe("Inspection Details");
    expect(normalizeSection("Safety")).toBe("Inspection Details");
    expect(normalizeSection("Appliances")).toBe("Built-in Appliances");
    expect(normalizeSection("Built In Appliances")).toBe("Built-in Appliances");
    expect(normalizeSection("Attic/Insulation & Ventilation")).toBe("Attic, Insulation & Ventilation");
    expect(normalizeSection("Attic, Insulation and Ventilation")).toBe("Attic, Insulation & Ventilation");
    expect(normalizeSection("Doors/Windows & Interior")).toBe("Doors, Windows & Interior");
    expect(normalizeSection("Basement/Foundation/Crawlspace & Structure")).toBe(
      "Basement, Foundation, Crawlspace & Structure",
    );
  });

  it("trims surrounding whitespace before matching", () => {
    expect(normalizeSection("  General  ")).toBe("Inspection Details");
    expect(normalizeSection(" Appliances ")).toBe("Built-in Appliances");
  });

  it("passes unknown section names through unchanged", () => {
    expect(normalizeSection("Roof")).toBe("Roof");
    expect(normalizeSection("Custom Pool Inspection")).toBe("Custom Pool Inspection");
  });

  // Documents the canonical behavior for a whitespace-only string (not a real
  // section name): the four page surfaces returned "" here, which this preserves.
  it("returns empty for a whitespace-only string (documented edge)", () => {
    expect(normalizeSection("   ")).toBe("");
  });
});
