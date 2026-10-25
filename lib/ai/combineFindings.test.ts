import { describe, expect, it } from "vitest";
import { SEVERITY_ORDER, severityRank, cleanStr } from "./combineFindings";

describe("severityRank", () => {
  it("ranks the known severities by seriousness", () => {
    expect(severityRank("Informational")).toBe(0);
    expect(severityRank("Major Concern")).toBe(SEVERITY_ORDER.length - 1);
    expect(severityRank("Safety Concern")).toBeGreaterThan(severityRank("Maintenance"));
  });

  it("defaults an unknown/blank severity to Recommended Repair's rank", () => {
    const fallback = SEVERITY_ORDER.indexOf("Recommended Repair");
    expect(severityRank("")).toBe(fallback);
    expect(severityRank("Nonsense")).toBe(fallback);
    expect(severityRank(null)).toBe(fallback);
  });

  it("a combine keeps the MOST serious severity among the inputs", () => {
    const inputs = ["Monitor", "Major Concern", "Maintenance"];
    const merged = SEVERITY_ORDER[Math.max(...inputs.map(severityRank))];
    expect(merged).toBe("Major Concern");
  });
});

describe("cleanStr", () => {
  it("trims and coerces nullish to empty string", () => {
    expect(cleanStr("  hi  ")).toBe("hi");
    expect(cleanStr(null)).toBe("");
    expect(cleanStr(undefined)).toBe("");
  });
});
