import { describe, expect, it } from "vitest";
import { licenseForState, sanitizeStateLicenses } from "./stateLicenses";

describe("per-state licenses", () => {
  it("cleans stored values", () => {
    expect(sanitizeStateLicenses('{"md":" 12345 ","WV":"HI-99","General":"x","PA":""}')).toEqual({
      MD: "12345",
      WV: "HI-99",
    });
    expect(sanitizeStateLicenses("not json")).toEqual({});
    expect(sanitizeStateLicenses(null)).toEqual({});
  });

  it("uses the agreement's state, then the job's state, then the general license", () => {
    const lic = { MD: "MD #1", WV: "WV #2" };
    expect(licenseForState("General #0", lic, "WV", "MD")).toBe("WV #2");
    expect(licenseForState("General #0", lic, "GENERAL", "MD")).toBe("MD #1");
    expect(licenseForState("General #0", lic, "PA")).toBe("General #0");
    expect(licenseForState(null, {}, "MD")).toBe("");
  });
});
