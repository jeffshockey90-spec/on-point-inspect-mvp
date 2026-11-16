import { describe, expect, it } from "vitest";
import { MATERIAL_FIELDS, buildMaterialFills } from "./checklistAutofill";
import { IDENTIFY_SECTIONS } from "./identifyResult";

describe("photo-readable system-info fields", () => {
  it("covers every section Identify can return (Heating/Cooling were missing)", () => {
    for (const section of IDENTIFY_SECTIONS) {
      expect(MATERIAL_FIELDS[section]?.length, section).toBeGreaterThan(0);
    }
  });

  it("turns an identified furnace into Heating checkbox fills", () => {
    const fills = buildMaterialFills("Heating", {
      Brand: "Carrier",
      "Energy Source": "Natural Gas",
      "Heat Type": "Forced Air",
      Ductwork: "Unknown",
    });
    expect(fills.map((f) => `${f.groupTitle}=${f.value}`)).toEqual([
      "Brand=Carrier",
      "Energy Source=Natural Gas",
      "Heat Type=Forced Air",
    ]);
  });
});
