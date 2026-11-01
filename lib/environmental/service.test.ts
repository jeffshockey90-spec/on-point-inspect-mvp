import { describe, it, expect } from "vitest";
import { hasRadonService, hasMoldService, getReportTitle } from "./service";

describe("hasRadonService", () => {
  it("detects radon via service_mode / inspection_type / services text", () => {
    expect(hasRadonService({ service_mode: "Radon Test" })).toBe(true);
    expect(hasRadonService({ inspection_type: "radon" })).toBe(true);
    expect(hasRadonService({ services: "Home + RADON" })).toBe(true);
  });
  it("detects radon via the boolean flag", () => {
    expect(hasRadonService({ radon: true })).toBe(true);
  });
  it("is false when nothing mentions radon", () => {
    expect(hasRadonService({ service_mode: "Mold Sampling" })).toBe(false);
    expect(hasRadonService({})).toBe(false);
    expect(hasRadonService(null)).toBe(false);
  });
});

describe("hasMoldService", () => {
  it("detects mold via text fields", () => {
    expect(hasMoldService({ service_mode: "Mold Sampling" })).toBe(true);
    expect(hasMoldService({ inspection_type: "MOLD" })).toBe(true);
    expect(hasMoldService({ services: "Home + mold" })).toBe(true);
  });
  it("detects mold via the boolean flag", () => {
    expect(hasMoldService({ mold: true })).toBe(true);
  });
  it("is false when nothing mentions mold", () => {
    expect(hasMoldService({ service_mode: "Radon Test" })).toBe(false);
    expect(hasMoldService({})).toBe(false);
    expect(hasMoldService(undefined)).toBe(false);
  });
});

describe("getReportTitle", () => {
  it("titles by which environmental services are present", () => {
    expect(getReportTitle({ service_mode: "Radon + Mold" })).toBe(
      "Environmental Testing Report"
    );
    expect(getReportTitle({ service_mode: "Radon Test" })).toBe(
      "Radon Testing Report"
    );
    expect(getReportTitle({ service_mode: "Mold Sampling" })).toBe(
      "Mold Sampling Report"
    );
  });
  it("falls back to the generic title when neither is detected", () => {
    expect(getReportTitle({})).toBe("Environmental Testing Report");
    expect(getReportTitle({ service_mode: "Home Inspection" })).toBe(
      "Environmental Testing Report"
    );
  });
});
