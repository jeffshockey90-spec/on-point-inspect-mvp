import { describe, it, expect } from "vitest";
import {
  customSectionGroups,
  customFieldTitles,
  materialFieldsFor,
  materialFieldMap,
  checklistLibraryWithCustom,
  loadChecklistOptionRows,
  CUSTOM_FIELD_MARKER,
  type ChecklistOptionRow,
} from "./customChecklist";
import { buildMaterialFills } from "./ai/checklistAutofill";

const field = (section: string, title: string, hidden = false): ChecklistOptionRow => ({
  section,
  group_title: title,
  option_label: CUSTOM_FIELD_MARKER,
  hidden,
});
const opt = (section: string, group: string, label: string, hidden = false): ChecklistOptionRow => ({
  section,
  group_title: group,
  option_label: `__CUSTOM__:${label}`,
  replacement_label: label,
  hidden,
});

const rows: ChecklistOptionRow[] = [
  field("Shed", "Siding"),
  opt("Shed", "Siding", "Vinyl"),
  opt("Shed", "Siding", "T1-11"),
  field("Shed", "Floor"),
  field("Shed", "Old Field", true),
  opt("Exterior", "Siding Material", "Hardie Board"),
  field("Pool", "Pool Type"),
];

describe("custom section fields", () => {
  it("lists a section's fields in order, skipping deleted ones", () => {
    expect(customFieldTitles(rows, "Shed")).toEqual(["Siding", "Floor"]);
  });

  it("builds groups with their options; no empty Custom Info once fields exist", () => {
    expect(customSectionGroups("Shed", rows)).toEqual([
      { title: "Siding", options: ["Vinyl", "T1-11"] },
      { title: "Floor", options: [] },
    ]);
  });

  it("keeps the legacy Custom Info group when it already has options, or when nothing is defined", () => {
    const legacy = [opt("Barn", "Custom Info", "Metal roof")];
    expect(customSectionGroups("Barn", legacy)).toEqual([{ title: "Custom Info", options: ["Metal roof"] }]);
    expect(customSectionGroups("Empty", [])).toEqual([{ title: "Custom Info", options: [] }]);
  });
});

describe("AI field vocabulary", () => {
  it("gives the photo AI a custom section's fields", () => {
    expect(materialFieldsFor("Shed", rows)).toEqual([
      { groupTitle: "Siding", options: ["Vinyl", "T1-11"] },
      { groupTitle: "Floor", options: [] },
    ]);
  });

  it("adds the inspector's own options to a built-in field", () => {
    const siding = materialFieldsFor("Exterior", rows).find((g) => g.groupTitle === "Siding Material");
    expect(siding?.options).toContain("Hardie Board");
    expect(siding?.options).toContain("Vinyl");
  });

  it("is empty for a custom section with nothing defined", () => {
    expect(materialFieldsFor("Empty", [])).toEqual([]);
  });

  it("maps only sections that have fields", () => {
    const map = materialFieldMap(["Shed", "Empty", "Roof"], rows);
    expect(Object.keys(map).sort()).toEqual(["Roof", "Shed"]);
  });

  it("voice vocabulary includes built-in sections and the report's custom sections", () => {
    const lib = checklistLibraryWithCustom(["Shed", "Pool"], rows);
    expect(lib["Shed"].map((g) => g.title)).toEqual(["Siding", "Floor"]);
    expect(lib["Pool"].map((g) => g.title)).toEqual(["Pool Type"]);
    expect(lib["Exterior"].find((g) => g.title === "Siding Material")?.options).toContain("Hardie Board");
  });
});

describe("buildMaterialFills with a server field map", () => {
  const map = { Shed: [{ groupTitle: "Siding", options: ["Vinyl", "T1-11"] }] };

  it("fills a custom section's field, snapping to its options", () => {
    const fills = buildMaterialFills("Shed", { Siding: "vinyl" }, map);
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ section: "Shed", groupTitle: "Siding", matched: true, value: "Vinyl" });
  });

  it("ignores fields the server didn't allow", () => {
    expect(buildMaterialFills("Shed", { Bogus: "x" }, map)).toEqual([]);
  });

  it("falls back to built-in fields when the section isn't in the map", () => {
    const fills = buildMaterialFills("Roof", { "Gutter Material": "Aluminum" }, map);
    expect(fills[0]).toMatchObject({ groupTitle: "Gutter Material", value: "Aluminum" });
  });
});

describe("loadChecklistOptionRows", () => {
  it("returns rows and tolerates errors", async () => {
    const q: any = { select: () => q, or: () => q, is: () => q, order: async () => ({ data: rows }) };
    expect(await loadChecklistOptionRows({ from: () => q }, "u1")).toHaveLength(rows.length);
    expect(await loadChecklistOptionRows({ from: () => { throw new Error("x"); } }, "u1")).toEqual([]);
  });
});
