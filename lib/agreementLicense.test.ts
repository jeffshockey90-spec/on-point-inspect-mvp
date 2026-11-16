import { describe, it, expect } from "vitest";
import { applyAgreementMergeFields } from "./agreementTemplates";

const template = "License: {{INSPECTOR_LICENSE}}\nState License No.: ____\nLicense Expiration Date: ____\n";

describe("agreement license fields", () => {
  it("uses the company's own License info", () => {
    const body = applyAgreementMergeFields({ templateBody: template, state: "MD", licenseInfo: "VA #3380001234" });
    expect(body).toContain("License: VA #3380001234");
    expect(body).toContain("State License No.: VA #3380001234");
  });

  it("never fills another company's license numbers", () => {
    for (const state of ["MD", "WV", "PA", "TX"]) {
      const body = applyAgreementMergeFields({ templateBody: template, state });
      expect(body).not.toMatch(/35912|HI5277172|12-07-27/);
    }
  });

  it("leaves the template's own blanks when no license info is set", () => {
    const body = applyAgreementMergeFields({ templateBody: template, state: "MD" });
    expect(body).toContain("State License No.: ____");
    expect(body).toContain("License Expiration Date: ____");
  });
});
