import { describe, it, expect } from "vitest";
import { normalizeStateCode, US_STATE_CODES } from "./usStates";

describe("normalizeStateCode", () => {
  it("accepts codes and names in any case", () => {
    expect(normalizeStateCode("tx")).toBe("TX");
    expect(normalizeStateCode(" Texas ")).toBe("TX");
    expect(normalizeStateCode("district of columbia")).toBe("DC");
    expect(normalizeStateCode("WV")).toBe("WV");
  });
  it("returns blank (never Maryland) for unknown values", () => {
    expect(normalizeStateCode("")).toBe("");
    expect(normalizeStateCode(null)).toBe("");
    expect(normalizeStateCode("Ontario")).toBe("");
  });
  it("covers all 50 states plus DC", () => {
    expect(US_STATE_CODES).toHaveLength(51);
  });
});
