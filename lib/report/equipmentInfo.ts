// Shared equipment-info display helpers for the report surfaces.
//
// This is Tier 1 of the report-render unification (pure logic, no JSX) — the
// one place the report builder, the client share page, and the print page agree
// on how equipment inventory values are shown. Previously each of those three
// files carried a byte-identical copy of these functions, so a wording tweak had
// to be made in three places or the surfaces silently diverged.
//
// NOTE: getEquipmentConditionNote() encodes the cautious-wording liability rule
// (never assert a component WILL fail / give a hard deadline) — keep that here so
// every surface stays consistent.

export function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

export function getTypicalIndustryRange(value: any) {
  const clean = String(value || "").trim();
  if (!isKnownEquipmentValue(clean)) return "";

  const rangeMatch = clean.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return `${rangeMatch[1]}–${rangeMatch[2]} years`;
  }

  const numberMatch = clean.match(/\d+/);
  if (!numberMatch) return clean;

  const upper = Number(numberMatch[0]);
  if (!Number.isFinite(upper) || upper <= 0) return clean;

  const lower = Math.max(1, upper - 5);
  return `${lower}–${upper} years`;
}

export function getEquipmentConditionNote(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!isKnownEquipmentValue(clean)) return "";

  if (
    lower.includes("remaining") ||
    lower.includes("service life") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  return clean;
}

export function getEquipmentInspectorNote(item: any) {
  return (
    item?.inspector_note ||
    item?.inspection_note ||
    item?.note ||
    item?.notes ||
    ""
  );
}

export function getEquipmentMaintenanceNote(item: any) {
  return (
    item?.maintenance_note ||
    item?.maintenance ||
    item?.service_note ||
    ""
  );
}
