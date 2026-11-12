// Multi-Unit Inspections — shared helpers for the unit/scope layer that sits
// ABOVE sections. A job may hold multiple units + Common Areas; findings and
// other per-scope rows carry a nullable `unit_id`. When an inspection has no
// units (every single-family job), the grouping helpers collapse to a single
// implicit scope so callers render exactly as they did before units existed.

export type InspectionUnit = {
  id: number;
  label: string;
  sortOrder: number;
  isCommonArea: boolean;
};

export type UnitNaming = "numeric" | "alpha";

/** Human label for the Nth unit (0-based), e.g. "Unit 1" or "Unit A". */
export function unitLabel(index: number, naming: UnitNaming): string {
  if (naming === "alpha") {
    // A, B, …, Z, then AA, AB, … (rare past Z, but safe).
    let n = index;
    let s = "";
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return `Unit ${s}`;
  }
  return `Unit ${index + 1}`;
}

/**
 * Rows to insert into `inspection_units` at job creation. Common Areas (if
 * included) sorts first, then Unit 1..count. Shape matches the table columns.
 */
export function buildDefaultUnitRows(opts: {
  count: number;
  naming: UnitNaming;
  commonAreas: boolean;
}): { label: string; sort_order: number; is_common_area: boolean }[] {
  const rows: { label: string; sort_order: number; is_common_area: boolean }[] = [];
  let sort = 0;
  if (opts.commonAreas) {
    rows.push({ label: "Common Areas", sort_order: sort++, is_common_area: true });
  }
  const count = Math.max(1, Math.min(50, Math.floor(opts.count) || 1));
  for (let i = 0; i < count; i++) {
    rows.push({ label: unitLabel(i, opts.naming), sort_order: sort++, is_common_area: false });
  }
  return rows;
}

/** Normalize raw `inspection_units` DB rows into ordered InspectionUnit[]. */
export function normalizeUnits(rows: any[] | null | undefined): InspectionUnit[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      id: Number(r.id),
      label: String(r.label ?? "").trim() || "Unit",
      sortOrder: Number(r.sort_order ?? 0),
      isCommonArea: !!r.is_common_area,
    }))
    .filter((u) => Number.isFinite(u.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export type SectionGroup<T> = { section: string; findings: T[] };
export type UnitGroup<T> = { unit: InspectionUnit | null; sections: SectionGroup<T>[] };

/**
 * Group findings by unit, then section. When `units` is empty this returns a
 * single group with `unit: null` holding every finding grouped by section —
 * byte-identical to the legacy flat `sectionOrder.map(...)` shape wrapped once,
 * so single-family reports are unchanged. `keepSection` lets a caller keep a
 * section that has no findings but does have other content (checklist / ref
 * photos / limitations / a note), matching today's per-surface filters.
 */
export function groupByUnitThenSection<T extends { section: string; unit_id?: number | null }>(
  findings: T[],
  units: InspectionUnit[],
  sectionOrder: string[],
  keepSection?: (section: string, unit: InspectionUnit | null) => boolean,
): UnitGroup<T>[] {
  const buildSections = (subset: T[], unit: InspectionUnit | null): SectionGroup<T>[] =>
    sectionOrder
      .map((section) => ({ section, findings: subset.filter((f) => f.section === section) }))
      .filter((g) => g.findings.length > 0 || (keepSection ? keepSection(g.section, unit) : false));

  if (!units.length) {
    return [{ unit: null, sections: buildSections(findings, null) }];
  }
  return units.map((unit) => ({
    unit,
    sections: buildSections(
      findings.filter((f) => Number(f.unit_id) === unit.id),
      unit,
    ),
  }));
}

/** True when this inspection should render with the unit layer. */
export function hasUnits(units: InspectionUnit[] | null | undefined): boolean {
  return Array.isArray(units) && units.length > 0;
}
