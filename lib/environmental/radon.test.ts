import { describe, it, expect } from "vitest";
import { classifyRadon, radonSummary } from "./radon";

describe("classifyRadon", () => {
  it("buckets by the EPA action-level thresholds", () => {
    expect(classifyRadon(0)).toBe("Pending");
    expect(classifyRadon(null)).toBe("Pending");
    expect(classifyRadon(1.9)).toBe("Low");
    expect(classifyRadon(2)).toBe("Monitor");
    expect(classifyRadon(3.9)).toBe("Monitor");
    expect(classifyRadon(4)).toBe("Action Recommended");
    expect(classifyRadon(7.3)).toBe("Action Recommended");
  });
  it("parses stringy pCi/L values", () => {
    expect(classifyRadon("4.1 pCi/L")).toBe("Action Recommended");
    expect(classifyRadon("1.2")).toBe("Low");
  });
});

describe("radonSummary", () => {
  it("explains a not-yet-entered result", () => {
    expect(radonSummary(0)).toBe("Radon test results have not been entered yet.");
  });
  it("recommends mitigation at or above 4.0", () => {
    const text = radonSummary(5.2);
    expect(text).toContain("5.2 pCi/L");
    expect(text).toContain("at or above the EPA action level");
    expect(text).toContain("Mitigation by a qualified radon contractor is recommended");
  });
  it("suggests monitoring between 2.0 and 4.0", () => {
    const text = radonSummary(2.5);
    expect(text).toContain("below the EPA action level of 4.0 pCi/L but above 2.0 pCi/L");
  });
  it("reports a low result below 2.0", () => {
    const text = radonSummary(1.1);
    expect(text).toContain("below the EPA action level of 4.0 pCi/L.");
    expect(text).not.toContain("above 2.0");
  });
});
