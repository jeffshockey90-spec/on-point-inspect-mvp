// Canonical report-section name normalizer (Tier 1 render unification).
//
// Legacy, imported (Spectora/HomeGauge), and aliased section names are mapped to
// the single canonical section name every surface groups by. This USED to be
// copy-pasted into five files — the report builder, the client share page, the
// print page, the client portal, and the PDF route. When those drifted, content
// grouped correctly on one surface but "silently dropped from the PDF" (it was
// grouped under a name the PDF's section order didn't know). One copy here means
// they can never disagree again.
//
// NOTE: the PDF route previously spelled the empty guard as
// `cleanText(section) || "Inspection Details"` (cleanText = String(x||"").trim()),
// which is identical to this for every real section name; the only theoretical
// difference is a whitespace-only input, which section names never are.

export const DEFAULT_SECTION = "Inspection Details";

export const SECTION_ALIASES: Record<string, string> = {
  General: "Inspection Details",
  Safety: "Inspection Details",
  "Basement/Foundation/Crawlspace & Structure":
    "Basement, Foundation, Crawlspace & Structure",
  "Basement, Foundation, Crawlspace and Structure":
    "Basement, Foundation, Crawlspace & Structure",
  "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
  "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
  "Doors/Windows & Interior": "Doors, Windows & Interior",
  "Doors, Windows and Interior": "Doors, Windows & Interior",
  Appliances: "Built-in Appliances",
  "Built In Appliances": "Built-in Appliances",
};

export function normalizeSection(section: string | null | undefined): string {
  if (!section) return DEFAULT_SECTION;

  const clean = section.trim();

  return SECTION_ALIASES[clean] || clean;
}
