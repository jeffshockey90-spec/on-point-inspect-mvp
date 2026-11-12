import { describe, it, expect } from "vitest";
import {
  unitLabel,
  buildDefaultUnitRows,
  normalizeUnits,
  groupByUnitThenSection,
  hasUnits,
  type InspectionUnit,
} from "./units";

describe("unitLabel", () => {
  it("numbers units from 1", () => {
    expect(unitLabel(0, "numeric")).toBe("Unit 1");
    expect(unitLabel(3, "numeric")).toBe("Unit 4");
  });
  it("letters units from A", () => {
    expect(unitLabel(0, "alpha")).toBe("Unit A");
    expect(unitLabel(1, "alpha")).toBe("Unit B");
    expect(unitLabel(25, "alpha")).toBe("Unit Z");
    expect(unitLabel(26, "alpha")).toBe("Unit AA");
  });
});

describe("buildDefaultUnitRows", () => {
  it("puts Common Areas first, then units", () => {
    const rows = buildDefaultUnitRows({ count: 2, naming: "alpha", commonAreas: true });
    expect(rows.map((r) => r.label)).toEqual(["Common Areas", "Unit A", "Unit B"]);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2]);
    expect(rows[0].is_common_area).toBe(true);
    expect(rows[1].is_common_area).toBe(false);
  });
  it("omits Common Areas when not included", () => {
    const rows = buildDefaultUnitRows({ count: 3, naming: "numeric", commonAreas: false });
    expect(rows.map((r) => r.label)).toEqual(["Unit 1", "Unit 2", "Unit 3"]);
  });
  it("clamps a nonsense count to at least 1", () => {
    expect(buildDefaultUnitRows({ count: 0, naming: "numeric", commonAreas: false })).toHaveLength(1);
  });
});

describe("normalizeUnits", () => {
  it("orders by sort_order and coerces types", () => {
    const units = normalizeUnits([
      { id: "7", label: "Unit B", sort_order: 2, is_common_area: false },
      { id: "5", label: "Common Areas", sort_order: 0, is_common_area: true },
      { id: "6", label: "Unit A", sort_order: 1, is_common_area: false },
    ]);
    expect(units.map((u) => u.label)).toEqual(["Common Areas", "Unit A", "Unit B"]);
    expect(units[0].id).toBe(5);
    expect(units[0].isCommonArea).toBe(true);
  });
  it("returns [] for nullish input", () => {
    expect(normalizeUnits(null)).toEqual([]);
    expect(normalizeUnits(undefined)).toEqual([]);
  });
});

describe("groupByUnitThenSection", () => {
  const sectionOrder = ["Exterior", "Roof", "Electrical"];
  type F = { id: number; section: string; unit_id?: number | null };

  it("collapses to one null-unit group when there are no units (legacy single-family)", () => {
    const findings: F[] = [
      { id: 1, section: "Roof" },
      { id: 2, section: "Exterior" },
    ];
    const groups = groupByUnitThenSection(findings, [], sectionOrder);
    expect(groups).toHaveLength(1);
    expect(groups[0].unit).toBeNull();
    // Only sections with findings are kept (no keepSection), in sectionOrder.
    expect(groups[0].sections.map((s) => s.section)).toEqual(["Exterior", "Roof"]);
    expect(groups[0].sections[0].findings.map((f) => f.id)).toEqual([2]);
  });

  it("splits findings across units by unit_id", () => {
    const units: InspectionUnit[] = [
      { id: 10, label: "Common Areas", sortOrder: 0, isCommonArea: true },
      { id: 11, label: "Unit A", sortOrder: 1, isCommonArea: false },
    ];
    const findings: F[] = [
      { id: 1, section: "Roof", unit_id: 10 },
      { id: 2, section: "Electrical", unit_id: 11 },
      { id: 3, section: "Roof", unit_id: 11 },
    ];
    const groups = groupByUnitThenSection(findings, units, sectionOrder);
    expect(groups).toHaveLength(2);
    expect(groups[0].unit?.label).toBe("Common Areas");
    expect(groups[0].sections.map((s) => s.section)).toEqual(["Roof"]);
    expect(groups[1].unit?.label).toBe("Unit A");
    expect(groups[1].sections.map((s) => s.section)).toEqual(["Roof", "Electrical"]);
    expect(groups[1].sections.find((s) => s.section === "Electrical")!.findings[0].id).toBe(2);
  });

  it("keepSection retains an empty section that has other content", () => {
    const groups = groupByUnitThenSection<F>([], [], sectionOrder, (section) => section === "Exterior");
    expect(groups[0].sections.map((s) => s.section)).toEqual(["Exterior"]);
  });
});

describe("hasUnits", () => {
  it("is true only with at least one unit", () => {
    expect(hasUnits([])).toBe(false);
    expect(hasUnits(null)).toBe(false);
    expect(hasUnits([{ id: 1, label: "Unit 1", sortOrder: 0, isCommonArea: false }])).toBe(true);
  });
});
