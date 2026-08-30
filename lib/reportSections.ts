export type ReportSectionOverride = {
  section_name: string;
  is_custom: boolean;
  deleted_at: string | null;
  sort_order: number;
};

// The fixed baseline home-inspection section order. The single source of truth
// for the default sections; report pages/PDF/field tool used to each declare
// their own copy.
export const BASE_SECTION_ORDER = [
  // Leads every report: the info-only section holding the inspection's
  // In Attendance / Occupancy / Style / Temperature / Type of Building /
  // Weather Conditions checklist + weather auto-fill. Not home-inspection
  // specific, so it survives the mold/radon service-mode trim below. An
  // inspector can still delete it per-report via the builder if unwanted.
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

// The fixed baseline section list is written for a full home inspection.
// A mold/radon-only visit (inspections.service_mode not starting with
// "home") never touched these, so hide them by default instead of showing
// a client a report full of empty "0 findings" home-inspection sections.
// Inspection Details and Disclaimers stay - they're not home-inspection
// specific. An inspector can still add any of these back per-inspection
// via "+ Add Section" if a mold/radon-only job genuinely needs one.
const HOME_INSPECTION_ONLY_SECTIONS = new Set([
  "exterior",
  "roof",
  "basement, foundation, crawlspace & structure",
  "heating",
  "cooling",
  "plumbing",
  "electrical",
  "fireplace",
  "attic, insulation & ventilation",
  "doors, windows & interior",
  "built-in appliances",
  "garage",
]);

export function includesHomeInspectionService(
  serviceMode?: string | null,
): boolean {
  // Legacy/blank service_mode predates this field - treat it as a full
  // home inspection so existing reports don't lose sections they already
  // relied on being visible.
  if (!serviceMode) return true;

  const mode = String(serviceMode).toLowerCase().trim();
  if (mode.startsWith("home")) return true;

  // Only a GENUINE radon/mold-only visit (radon and/or mold, nothing else)
  // should hide the standard home-inspection sections. Everything else -
  // including CUSTOM services an inspector creates (e.g. "structural &
  // mechanical") - is a full inspection and must show its standard sections in
  // the report builder, share report, and PDF. Previously any non-"home"
  // service_mode (all custom services) wrongly trimmed the 12 sections.
  const environmentalOnly =
    /^(radon|mold)(\s*[&+_/,-]?\s*(radon|mold|only|test|inspection))*$/;

  return !environmentalOnly.test(mode);
}

export function filterSectionsForServiceMode(
  sections: string[],
  serviceMode?: string | null,
): string[] {
  if (includesHomeInspectionService(serviceMode)) return sections;

  return sections.filter(
    (section) => !HOME_INSPECTION_ONLY_SECTIONS.has(section.toLowerCase().trim()),
  );
}

// Merges the fixed baseline section list with an inspection's custom
// sections and deletions. Used identically by the report builder, print
// page, share page, and PDF download so a custom section (or a deleted
// one) shows up consistently everywhere instead of only in the builder.
export function resolveActiveSections(
  baseSectionOrder: string[],
  overrides: ReportSectionOverride[] | null | undefined,
  customOrder?: string[] | null,
): string[] {
  const rows = overrides || [];

  const deletedNames = new Set(
    rows.filter((row) => row.deleted_at).map((row) => row.section_name.toLowerCase().trim()),
  );

  const customActive = rows
    .filter((row) => row.is_custom && !row.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => row.section_name);

  const baseActive = baseSectionOrder.filter(
    (section) => !deletedNames.has(section.toLowerCase().trim()),
  );

  // Garage conventionally trails the fixed list - keep custom sections
  // ahead of it rather than after, so Garage still reads as "last".
  const garageIndex = baseActive.findIndex((section) => section.toLowerCase() === "garage");

  const mergedRaw =
    garageIndex === -1
      ? [...baseActive, ...customActive]
      : [
          ...baseActive.slice(0, garageIndex),
          ...customActive,
          ...baseActive.slice(garageIndex),
        ];

  // Guard against a duplicate when a report also carries a manually-added
  // custom section whose name collides with a base one (e.g. someone added
  // their own "Inspection Details"). Keep the first occurrence, case-insensitive.
  const seen = new Set<string>();
  const merged = mergedRaw.filter((name) => {
    const key = name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // If the inspector saved a custom section order (drag-to-reorder in the
  // builder), honor it: sections named in customOrder lead, in that order;
  // anything not listed (e.g. a section added after the order was saved) keeps
  // its default relative position at the end. Stable so ties preserve order.
  const order = (customOrder || []).map((name) => name.toLowerCase().trim());
  if (order.length === 0) return merged;

  const rank = (name: string) => {
    const index = order.indexOf(name.toLowerCase().trim());
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return merged
    .map((name, index) => ({ name, index }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.index - b.index)
    .map((entry) => entry.name);
}

// The one place that turns an inspection into its active report sections,
// honoring (in priority): an applied REPORT TEMPLATE (an explicit section list
// snapshotted onto the inspection) → the per-report custom sections/deletions/
// order → otherwise the base list trimmed for radon/mold-only visits.
//
// When a template is applied, its list IS the section set — the service-mode
// trim is skipped (the template already says exactly which sections to show).
// The AI camera / field tool, report builder, share report, and PDF all resolve
// through this, so they stay perfectly in sync.
export function resolveReportSections(opts: {
  overrides: ReportSectionOverride[] | null | undefined;
  customOrder?: string[] | null;
  serviceMode?: string | null;
  templateSections?: string[] | null;
}): string[] {
  const template =
    Array.isArray(opts.templateSections) && opts.templateSections.length
      ? opts.templateSections.map((s) => String(s)).filter(Boolean)
      : null;

  const base = template || BASE_SECTION_ORDER;
  const resolved = resolveActiveSections(base, opts.overrides, opts.customOrder);

  return template ? resolved : filterSectionsForServiceMode(resolved, opts.serviceMode);
}
