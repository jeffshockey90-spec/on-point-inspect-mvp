import { describe, it, expect } from "vitest";
import { normalizeAgreementState, getAgreementTitle, getAgreementVersion } from "./agreementTemplates";

describe("agreement state for every US state", () => {
  it("keeps any real state instead of forcing Maryland", () => {
    expect(normalizeAgreementState("TX")).toBe("TX");
    expect(normalizeAgreementState("Ohio")).toBe("OH");
    expect(normalizeAgreementState("wv")).toBe("WV");
  });
  it("is blank — not MD — when unknown", () => {
    expect(normalizeAgreementState("")).toBe("");
    expect(normalizeAgreementState(null)).toBe("");
  });
  it("titles and versions work for other states and blanks", () => {
    expect(getAgreementTitle("TX")).toBe("TX Residential Inspection Agreement");
    expect(getAgreementTitle("")).toBe("Residential Inspection Agreement");
    expect(getAgreementVersion("TX")).toBe("TX Inspection Agreement");
    expect(getAgreementVersion("PA")).toBe("PA InterNACHI Contract - V5");
  });
});
