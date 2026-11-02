// Shared repair-item numbering for the report surfaces.
//
// The report builder, the client share page, and the print page each walked
// the findings and assigned a "section.group.count" item number (e.g. "3.1.2")
// with byte-identical logic — this is the algorithm that once drifted and made
// the PDF's item numbers disagree with the report. Centralize the ALGORITHM
// here; each surface keeps its own output-field mapping at the call site (the
// builder/share write item_number + repair_item_number, the print page writes
// report_item_number), so this extraction changes no surface's behavior.

import { getRepairNumberTitle, getRepairItemGroupLabel } from "./findingFields";
import { normalizeSection } from "./normalizeSection";

export type ItemNumberParts = {
  section: string;
  originalTitle: string;
  itemNumber: string;
};

// Walks findings in order, computes each one's item number, and lets the caller
// map the result onto whatever fields that surface reads. An explicit
// sectionOrder is required (each surface passes its own) so numbering never
// depends on a default that could differ between files.
export function withItemNumbers<T>(
  findings: T[],
  sectionOrder: string[],
  assign: (finding: T, parts: ItemNumberParts) => any
): any[] {
  const sectionGroupMap = new Map<string, number>();
  const sectionGroupCounts = new Map<string, number>();

  return (findings || []).map((finding: any) => {
    const section = normalizeSection(finding?.section);
    const sectionNumberRaw = sectionOrder.indexOf(section) + 1;
    const sectionNumber =
      sectionNumberRaw > 0 ? sectionNumberRaw : sectionOrder.length + 1;
    const groupLabel = getRepairItemGroupLabel(finding).toLowerCase();
    const sectionGroupKey = `${sectionNumber}:${groupLabel}`;

    if (!sectionGroupMap.has(sectionGroupKey)) {
      const existingGroupsForSection = Array.from(sectionGroupMap.keys()).filter(
        (key) => key.startsWith(`${sectionNumber}:`)
      ).length;

      sectionGroupMap.set(sectionGroupKey, existingGroupsForSection + 1);
    }

    const groupNumber = sectionGroupMap.get(sectionGroupKey) || 1;
    const countKey = `${sectionNumber}.${groupNumber}`;
    const nextCount = (sectionGroupCounts.get(countKey) || 0) + 1;
    sectionGroupCounts.set(countKey, nextCount);

    const itemNumber =
      finding?.repair_item_number ||
      finding?.item_number ||
      finding?.finding_number ||
      `${sectionNumber}.${groupNumber}.${nextCount}`;

    return assign(finding, {
      section,
      originalTitle: getRepairNumberTitle(finding),
      itemNumber,
    });
  });
}
