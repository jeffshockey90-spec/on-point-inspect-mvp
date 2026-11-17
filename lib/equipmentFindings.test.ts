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

import { relatedLimitations, limitationCandidates, limitationConditionText } from "./equipmentFindings";

describe("limitations on equipment", () => {
  const limitations = [
    { section: "Plumbing", label: "Not Tested", custom_text: "Water heater not tested — gas supply off" },
    { section: "Cooling", label: "Not Operated", limitation_comment: "A/C not operated due to low outdoor temperature" },
    { section: "Plumbing", label: "Inaccessible", custom_text: "Main shutoff behind storage", needs_review: true },
  ];

  it("finds the limitation for the scanned equipment only", () => {
    expect(relatedLimitations("Water Heater", limitations)).toEqual([
      "Not Tested — Water heater not tested — gas supply off",
    ]);
    expect(relatedLimitations("Air Conditioner Condenser", limitations)).toHaveLength(1);
  });

  it("offers saved limitations to the AI and words the condition", () => {
    expect(limitationCandidates(limitations)).toHaveLength(2);
    expect(limitationConditionText(["A/C not operated"])).toBe(
      "Not fully evaluated — see the report limitation: A/C not operated.",
    );
  });
});
