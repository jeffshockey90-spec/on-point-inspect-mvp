import { describe, expect, it } from "vitest";
import {
  MECHANICAL_STRUCTURAL_DEFAULT_SCOPE,
  isMarylandWalkthrough,
  reportScopeFor,
  reportTitleFor,
} from "./serviceScope";
import { marylandReportNotice, needsMarylandDisclosure } from "./marylandDisclosure";

const config = {
  services: [
    { id: "home", name: "Home Inspection", type: "sqft_formula" as const },
    {
      id: "x1",
      name: "Pool Check",
      type: "flat" as const,
      reportScope: { included: "Pool shell\n- Pump", excluded: "Heater" },
    },
  ],
};

describe("report scope", () => {
  it("uses the service's own lists when set", () => {
    expect(reportScopeFor(config, { service_mode: "pool_check" })).toEqual({
      serviceName: "Pool Check",
      included: ["Pool shell", "Pump"],
      excluded: ["Heater"],
    });
  });

  it("defaults a Mechanical & Structural job to the standard lists", () => {
    const scope = reportScopeFor(null, { service_mode: "mechanical_structural" });
    expect(scope?.included).toEqual(MECHANICAL_STRUCTURAL_DEFAULT_SCOPE.included);
    expect(scope?.excluded).toContain("Built-in and freestanding appliances");
  });

  it("has no scope section for a full home inspection", () => {
    expect(reportScopeFor(config, { service_mode: "home" })).toBeNull();
  });
});

describe("Maryland walkthrough", () => {
  const md = { state: "MD", service_mode: "pre_offer_verbal_walkthrough" };
  it("is a consultation in Maryland only", () => {
    expect(isMarylandWalkthrough(md, "MD")).toBe(true);
    expect(isMarylandWalkthrough({ ...md, state: "WV" }, "WV")).toBe(false);
    expect(reportTitleFor(md, "MD", "Residential Home Inspection Report")).toBe("Walkthrough Consultation");
    expect(reportTitleFor({ state: "MD", service_mode: "home" }, "MD", "Residential Home Inspection Report")).toBe(
      "Residential Home Inspection Report",
    );
  });

  it("gets the consultation notice instead of the home-inspection disclosure", () => {
    expect(marylandReportNotice(md)).toBe("walkthrough");
    expect(needsMarylandDisclosure(md)).toBe(false);
    expect(marylandReportNotice({ state: "MD", service_mode: "mechanical_structural" })).toBe("disclosure");
    expect(marylandReportNotice({ state: "WV", service_mode: "pre_offer_verbal_walkthrough" })).toBeNull();
  });
});

import { isVerbalOnlyJob, isVerbalOnlyService } from "./serviceScope";

describe("verbal-only services (no written report)", () => {
  it("recognizes verbal walkthrough services only", () => {
    expect(isVerbalOnlyService("Pre Offer Verbal Walkthrough")).toBe(true);
    expect(isVerbalOnlyJob({ service_mode: "pre_offer_verbal_walkthrough" })).toBe(true);
    expect(isVerbalOnlyJob({ service_mode: "mechanical_and_structural" })).toBe(false);
    expect(isVerbalOnlyJob({ service_mode: "home" })).toBe(false);
    expect(isVerbalOnlyService("Verbalize")).toBe(false);
  });
});
