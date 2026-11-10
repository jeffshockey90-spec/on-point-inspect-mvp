// Point-and-identify: the normalized shape returned by /api/ai/identify and the
// pure normalizer that validates the model's raw JSON. Kept dependency-free so
// it can be unit-tested without the route or OpenAI.
//
// Identify is a FAST "what am I pointing at" read for the live camera. It only
// LABELS the component and proposes a conservative severity — it never writes
// client-facing prose. The eventual finding write-up is drafted later by the
// shared FLOW Writer background path, which seeds off this label.

// The report sections the model may route a component to. Must match the finding
// pipeline's sections so the handed-off draft lands in the right place.
export const IDENTIFY_SECTIONS = [
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
] as const;

// The 6 canonical severity LABELS. Identify returns one of these; the client
// resolves it through the company's custom severity config for display + picker,
// so renamed/recolored levels still work (see lib/severity/severityConfig).
export const IDENTIFY_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
] as const;

export type IdentifyResult = {
  /** Short specific name, e.g. "Federal Pacific Stab-Lok electrical panel". */
  label: string;
  /** Generic component type, e.g. "electrical panel". */
  componentType: string;
  /** Best-matching report section (always one of IDENTIFY_SECTIONS). */
  section: string;
  /** Canonical severity label (always one of IDENTIFY_SEVERITIES). */
  severity: string;
  /** True only for a WELL-KNOWN inspection hazard (e.g. FPE/Zinsco panel). */
  hazard: boolean;
  /** Short reason the hazard matters (only meaningful when hazard is true). */
  hazardNote: string;
  /** 0-100 model confidence in the identification. */
  confidence: number;
  /** True when it's a defect/hazard/notable component worth a finding. */
  worthLogging: boolean;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const v = cleanText(value).toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function clampConfidence(value: unknown, fallback = 70): number {
  // Prefer the raw number (so a negative clamps to 0); fall back to stripping
  // stray characters off a stringy value like "88%".
  let n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSection(value: unknown, fallback: string): string {
  const clean = cleanText(value);
  return (IDENTIFY_SECTIONS as readonly string[]).includes(clean) ? clean : fallback;
}

function normalizeSeverity(value: unknown): string {
  const clean = cleanText(value);
  if ((IDENTIFY_SEVERITIES as readonly string[]).includes(clean)) return clean;
  // Nudge common near-miss phrasings onto a canonical label; otherwise stay
  // conservative with Informational (identify never invents a defect).
  const v = clean.toLowerCase();
  if (!v) return "Informational";
  if (v.includes("major")) return "Major Concern";
  if (v.includes("safety") || v.includes("hazard") || v.includes("danger")) return "Safety Concern";
  if (v.includes("repair") || v.includes("defic")) return "Recommended Repair";
  if (v.includes("maintenance") || v.includes("service")) return "Maintenance";
  if (v.includes("monitor")) return "Monitor";
  return "Informational";
}

// Coerce the model's raw JSON into a safe IdentifyResult. `fallbackSection` is the
// section the camera was on, used when the model doesn't give a valid one.
export function normalizeIdentifyResult(
  raw: any,
  fallbackSection = "Exterior",
): IdentifyResult {
  const r = raw && typeof raw === "object" ? raw : {};
  const componentType = cleanText(r.componentType ?? r.component_type ?? r.type);
  const label = cleanText(r.label ?? r.name ?? r.title) || componentType || "Unidentified component";
  const hazard = cleanBool(r.hazard ?? r.isHazard ?? r.is_hazard);
  const severityRaw = r.severity ?? (hazard ? "Safety Concern" : "");
  const safeSection = normalizeSection(r.section, (IDENTIFY_SECTIONS as readonly string[]).includes(fallbackSection) ? fallbackSection : "Exterior");

  return {
    label,
    componentType: componentType || label,
    section: safeSection,
    severity: normalizeSeverity(severityRaw),
    hazard,
    hazardNote: cleanText(r.hazardNote ?? r.hazard_note ?? r.reason),
    confidence: clampConfidence(r.confidence ?? r.confidenceScore ?? r.confidence_score),
    // Worth a finding when the model says so, or whenever it's a known hazard.
    worthLogging: hazard || cleanBool(r.worthLogging ?? r.worth_logging ?? r.defectWorthy ?? r.defect_worthy),
  };
}
