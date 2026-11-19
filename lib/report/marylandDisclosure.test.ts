import { describe, expect, it } from "vitest";
import {
  MD_REPORT_DISCLOSURE_STATEMENTS,
  inspectionStateCode,
  marylandDisclosureHtml,
  marylandLicenseFor,
  needsMarylandDisclosure,
} from "./marylandDisclosure";

describe("Maryland report disclosure", () => {
  it("has the four statutory statements", () => {
    expect(MD_REPORT_DISCLOSURE_STATEMENTS).toHaveLength(4);
    expect(MD_REPORT_DISCLOSURE_STATEMENTS[3]).toMatch(/Maryland licensed home inspectors/);
  });

  it("applies only to Maryland properties", () => {
    expect(needsMarylandDisclosure({ state: "MD" })).toBe(true);
    expect(needsMarylandDisclosure({ state: "Maryland" })).toBe(true);
    expect(needsMarylandDisclosure({ state: "WV" })).toBe(false);
    expect(needsMarylandDisclosure({ state: "PA" })).toBe(false);
    expect(needsMarylandDisclosure({})).toBe(false);
  });

  it("falls back to the state in the property address", () => {
    expect(inspectionStateCode({ property_address: "12 Main St, Hagerstown, MD 21740" })).toBe("MD");
    expect(inspectionStateCode({ property_address: "12 Main St, Martinsburg, WV 25401" })).toBe("WV");
    expect(inspectionStateCode({ state: "", property_address: "12 Main St" })).toBe("");
  });

  it("uses the company's Maryland license number when set", () => {
    expect(marylandLicenseFor({ license_info: "General 1", state_licenses: { MD: "MD-123", WV: "WV-9" } })).toBe("MD-123");
    expect(marylandLicenseFor({ license_info: "General 1" })).toBe("General 1");
  });

  it("renders 14-point bold statements and the license", () => {
    const html = marylandDisclosureHtml("MD-123");
    expect(html.match(/font-size:14pt !important;font-weight:700/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("License No.: MD-123");
    for (const s of MD_REPORT_DISCLOSURE_STATEMENTS) expect(html).toContain(s);
  });
});
