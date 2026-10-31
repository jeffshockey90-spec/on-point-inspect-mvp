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
