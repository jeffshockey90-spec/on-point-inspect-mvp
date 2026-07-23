export type ReportSectionOverride = {
  section_name: string;
  is_custom: boolean;
  deleted_at: string | null;
  sort_order: number;
};

// Merges the fixed baseline section list with an inspection's custom
// sections and deletions. Used identically by the report builder, print
// page, share page, and PDF download so a custom section (or a deleted
// one) shows up consistently everywhere instead of only in the builder.
export function resolveActiveSections(
  baseSectionOrder: string[],
  overrides: ReportSectionOverride[] | null | undefined,
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

  if (garageIndex === -1) {
    return [...baseActive, ...customActive];
  }

  return [
    ...baseActive.slice(0, garageIndex),
    ...customActive,
    ...baseActive.slice(garageIndex),
  ];
}
