import { describe, expect, it } from "vitest";
import { deficiencyConditionText, relatedDefectFindings } from "./equipmentFindings";

const findings = [
  { title: "Water heater TPR discharge pipe missing", severity: "Safety Concern" },
  { title: "Water heater data plate", severity: "Informational" },
  { title: "Furnace filter dirty", severity: "Maintenance / Monitor" },
  { title: "Range anti-tip bracket missing", severity: "Safety Concern" },
  { title: "Rusted water heater tank", severity: "Recommended Repair", needs_review: true },
];

describe("relatedDefectFindings", () => {
  it("finds the defects written up for a water heater and ignores informational/other equipment", () => {
    expect(relatedDefectFindings("Gas Water Heater", findings)).toEqual([
      { title: "Water heater TPR discharge pipe missing", severity: "Safety Concern" },
    ]);
  });

  it("does not match a word inside another word", () => {
    // "range" must not match "arrange" / "orange".
    expect(relatedDefectFindings("Range", [{ title: "Arrange for service", severity: "Monitor" }])).toEqual([]);
  });

  it("returns nothing for an unknown type", () => {
    expect(relatedDefectFindings("Unknown", findings)).toEqual([]);
  });
});

describe("deficiencyConditionText", () => {
  it("names the related findings", () => {
    expect(deficiencyConditionText([{ title: "TPR pipe missing" }])).toBe(
      "Deficiencies noted — see the report finding: TPR pipe missing.",
    );
  });
});
