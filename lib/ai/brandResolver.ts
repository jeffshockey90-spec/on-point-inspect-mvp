// The ONE shared brand/manufacturer reading rule, injected into every AI path
// that reads equipment (the field Equipment Analyzer and the live-camera
// point-and-identify flow). It stops the two failure modes seen in the field:
// (a) hallucinating a competitor brand that isn't on the unit (a "SmartComfort"
// furnace getting called "Goodman" or "American Standard"), and (b) reporting
// the plate's legal/parent company instead of the cabinet brand ("ICP" /
// "International Comfort Products" instead of "SmartComfort").
export const BRAND_READING_RULE = `BRAND / MANUFACTURER — READ WHAT IS PRINTED, DO NOT GUESS:
- Report the brand EXACTLY as it is printed on the unit. The consumer brand is the logo or badge on the CABINET / faceplate (for example "SmartComfort", "Goodman", "Rheem"); the data plate may ALSO list the legal or parent manufacturer (for example "International Comfort Products", "ICP", "Daikin Comfort Technologies", "Nortek"). When both are visible, report the CABINET BADGE brand and treat the plate's parent-company name only as supporting evidence — never as the brand.
- NEVER infer, guess, or assume a brand from the unit's shape, color, cabinet style, louver pattern, or general appearance. A brand is valid ONLY when its name or logo is actually legible in one of the photos.
- NEVER substitute a better-known or competitor brand for what is printed, and never "round" an unfamiliar brand to a familiar one (for example, do not call a SmartComfort or ICP-family unit "Goodman", "Carrier", "Trane", or "American Standard").
- If no brand name or logo is legible anywhere in the photos, the brand is Unknown — say Unknown rather than naming any manufacturer.`;

// Daikin Comfort Technologies manufactures three HVAC brands off shared
// platforms — Goodman, Amana, and Daikin. A unit's data plate shows the legal
// manufacturer ("DAIKIN COMFORT TECHNOLOGIES MANUFACTURING, L.P."), which is the
// PARENT company, not the consumer brand on the cabinet. Reading that plate text
// alone makes the AI label a Goodman furnace "Daikin" — seen in the live-camera
// path, where the vision model latches onto the large plate text instead of the
// smaller brand logo on the unit.
//
// Within this family the brand is set by the MODEL-number prefix letter:
//   G… → Goodman (e.g. GM9S960603BNAB)
//   A… → Amana   (e.g. ASXC603610)
//   D… → Daikin  (e.g. DM96VC0603BN / DX13SA)
// So when the read brand is any Daikin-family name, let the model prefix pick the
// real brand. Units outside the family are returned unchanged, and an unreadable
// model (or an unexpected prefix) keeps whatever brand was read.
export function resolveDaikinFamilyBrand(
  manufacturer: string,
  model: string,
): string {
  const brand = String(manufacturer || "").trim();
  const lower = brand.toLowerCase();

  const isDaikinFamily =
    lower.includes("daikin") ||
    lower.includes("goodman") ||
    lower.includes("amana");
  if (!isDaikinFamily) return brand;

  const firstLetter = String(model || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .charAt(0);

  if (firstLetter === "G") return "Goodman";
  if (firstLetter === "A") return "Amana";
  if (firstLetter === "D") return "Daikin";

  return brand;
}
