import { describe, it, expect } from "vitest";
import {
  isKnownEquipmentValue,
  getTypicalIndustryRange,
  getEquipmentConditionNote,
  getEquipmentInspectorNote,
  getEquipmentMaintenanceNote,
} from "./equipmentInfo";

// Characterization tests: these pin the EXACT current behavior that was
// previously inlined (identically) in the report builder, share, and print
// pages, so the extraction is provably behavior-preserving.

describe("isKnownEquipmentValue", () => {
  it("accepts real values", () => {
    expect(isKnownEquipmentValue("Goodman")).toBe(true);
    expect(isKnownEquipmentValue("Daikin")).toBe(true);
    expect(isKnownEquipmentValue("2024")).toBe(true);
  });
  it("rejects unknown/placeholder values (case-insensitive)", () => {
    for (const v of ["unknown", "N/A", "na", "Not Available", "not visible", "not readable", "none", "null", "undefined"]) {
      expect(isKnownEquipmentValue(v)).toBe(false);
    }
  });
  it("rejects empty/blank/nullish", () => {
    expect(isKnownEquipmentValue("")).toBe(false);
    expect(isKnownEquipmentValue("   ")).toBe(false);
    expect(isKnownEquipmentValue(null)).toBe(false);
    expect(isKnownEquipmentValue(undefined)).toBe(false);
  });
});

describe("getTypicalIndustryRange", () => {
  it("passes through an explicit range, normalizing the dash", () => {
    expect(getTypicalIndustryRange("15-20 years")).toBe("15–20 years");
    expect(getTypicalIndustryRange("15–20")).toBe("15–20 years");
  });
  it("derives a range from a single number (upper - 5, floored at 1)", () => {
    expect(getTypicalIndustryRange("20")).toBe("15–20 years");
    expect(getTypicalIndustryRange("3")).toBe("1–3 years");
  });
  it("returns the cleaned value when there is no number", () => {
    expect(getTypicalIndustryRange("varies")).toBe("varies");
  });
  it("returns empty for unknown/placeholder input", () => {
    expect(getTypicalIndustryRange("unknown")).toBe("");
    expect(getTypicalIndustryRange("")).toBe("");
  });
});

describe("getEquipmentConditionNote (cautious wording)", () => {
  it("collapses service-life phrasing to the cautious note", () => {
    expect(getEquipmentConditionNote("5 years life remaining")).toBe("No specific deficiency noted");
    expect(getEquipmentConditionNote("near end of service life")).toBe("No specific deficiency noted");
    expect(getEquipmentConditionNote("some remaining")).toBe("No specific deficiency noted");
  });
  it("passes through a real condition", () => {
    expect(getEquipmentConditionNote("cracked heat exchanger")).toBe("cracked heat exchanger");
  });
  it("returns empty for unknown input", () => {
    expect(getEquipmentConditionNote("N/A")).toBe("");
  });
});

describe("equipment note getters", () => {
  it("picks the first present inspector-note field", () => {
    expect(getEquipmentInspectorNote({ inspector_note: "a", notes: "b" })).toBe("a");
    expect(getEquipmentInspectorNote({ notes: "b" })).toBe("b");
    expect(getEquipmentInspectorNote({})).toBe("");
  });
  it("picks the first present maintenance-note field", () => {
    expect(getEquipmentMaintenanceNote({ maintenance_note: "x" })).toBe("x");
    expect(getEquipmentMaintenanceNote({ service_note: "z" })).toBe("z");
    expect(getEquipmentMaintenanceNote({})).toBe("");
  });
});
