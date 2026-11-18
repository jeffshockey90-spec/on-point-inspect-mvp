import { describe, expect, it } from "vitest";
import { inspectionTypeLabels } from "./inspectionTypeLabels";

describe("inspectionTypeLabels", () => {
  it("labels built-in combos", () => {
    expect(inspectionTypeLabels({ service_mode: "home_radon_mold" })).toEqual(["Home Inspection", "Radon", "Mold"]);
    expect(inspectionTypeLabels({ service_mode: "radon_only" })).toEqual(["Radon"]);
  });

  it("labels custom services, walkthroughs, re-inspections and add-ons", () => {
    expect(inspectionTypeLabels({ service_mode: "pre_offer_verbal_walkthrough" })).toEqual(["Pre Offer Verbal Walkthrough"]);
    expect(inspectionTypeLabels({ service_mode: "home_orientation" })).toEqual(["Home Orientation"]);
    expect(inspectionTypeLabels({ service_mode: "home", parent_inspection_id: 9 })).toEqual(["Re-Inspection", "Home Inspection"]);
    expect(
      inspectionTypeLabels({ service_mode: "home", service_fees: { home: 450, sewer_scope: 200, travel: 25 } }),
    ).toEqual(["Home Inspection", "Sewer Scope"]);
  });

  it("falls back to booked service text", () => {
    expect(inspectionTypeLabels({ service_type: "Buyer Home Inspection, Radon Testing" })).toEqual([
      "Buyer Home Inspection",
      "Radon Testing",
    ]);
    expect(inspectionTypeLabels({})).toEqual([]);
  });
});
