export type ReportSectionOverride = {
  section_name: string;
  is_custom: boolean;
  deleted_at: string | null;
  sort_order: number;
};

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

  const merged =
    garageIndex === -1
      ? [...baseActive, ...customActive]
      : [
          ...baseActive.slice(0, garageIndex),
          ...customActive,
          ...baseActive.slice(garageIndex),
        ];

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
