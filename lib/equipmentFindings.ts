// Ties a scanned piece of equipment to the defects ALREADY written on the
// report for that kind of equipment. Without this, scanning a water heater the
// inspector had already written up (e.g. a missing TPR discharge pipe) still
// read "No specific deficiency noted" — the scan only looked at the data plate.

const TYPE_KEYWORDS: Array<{ match: RegExp; words: string[] }> = [
  {
    match: /water\s*heater|hot\s*water|tankless/i,
    words: ["water heater", "hot water", "tankless", "tpr", "t&p", "t/p", "relief valve", "pressure relief", "expansion tank", "anode"],
  },
  { match: /boiler/i, words: ["boiler"] },
  {
    // Not "water heater" — that's its own type above.
    match: /furnace|air\s*handler|heating|^(?!.*water).*\bheater\b/i,
    words: ["furnace", "air handler", "heat exchanger", "burner", "blower", "heating system", "heating unit"],
  },
  {
    match: /condens|a\/?c\b|air\s*condition|heat\s*pump|cooling|mini[-\s]?split/i,
    words: ["condenser", "condensing unit", "a/c", "air condition", "heat pump", "refrigerant", "line set", "evaporator", "cooling system", "cooling unit", "mini split", "mini-split"],
  },
  {
    match: /panel|electrical|breaker|load\s*center/i,
    words: ["panel", "breaker", "double tap", "double-tap", "load center", "service disconnect", "bonding", "neutral"],
  },
  { match: /dishwasher/i, words: ["dishwasher"] },
  { match: /refrigerator|fridge/i, words: ["refrigerator", "fridge"] },
  { match: /range|oven|cooktop|stove/i, words: ["range", "oven", "cooktop", "stove"] },
  { match: /microwave/i, words: ["microwave"] },
  { match: /disposal/i, words: ["disposal"] },
  { match: /washer|dryer/i, words: ["washer", "dryer", "dryer vent"] },
  { match: /garage\s*door\s*opener|opener/i, words: ["garage door opener", "opener", "auto-reverse", "auto reverse"] },
  { match: /sump/i, words: ["sump"] },
  { match: /well\s*pump|pressure\s*tank/i, words: ["well pump", "pressure tank"] },
];

const NON_DEFECT = /^(informational|info|maintenance item|none)$/i;

function keywordsFor(equipmentType: string): string[] {
  const type = String(equipmentType || "");
  const words = TYPE_KEYWORDS.filter((t) => t.match.test(type)).flatMap((t) => t.words);
  const own = type.trim().toLowerCase();
  if (own && own.length >= 4 && !/unknown|equipment/.test(own)) words.push(own);
  return Array.from(new Set(words));
}

function mentionsAny(words: string[], text: string): boolean {
  const lower = text.toLowerCase();
  return words.some((w) =>
    new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z]|$)`).test(lower),
  );
}

/** Defect findings on the report that are about this equipment type. */
export function relatedDefectFindings(
  equipmentType: string,
  findings: Array<{ title?: string | null; observation?: string | null; severity?: string | null; needs_review?: boolean | null }>,
): Array<{ title: string; severity: string }> {
  const words = keywordsFor(equipmentType);
  if (!words.length) return [];
  const out: Array<{ title: string; severity: string }> = [];
  for (const f of findings || []) {
    if (f?.needs_review === true) continue;
    const severity = String(f?.severity || "").trim();
    if (!severity || NON_DEFECT.test(severity)) continue;
    const text = `${f?.title || ""} ${f?.observation || ""}`.toLowerCase();
    if (words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z]|$)`).test(text))) {
      out.push({ title: String(f?.title || "Finding").trim(), severity });
    }
  }
  return out;
}

/** Every saved defect on the report (no info items / review drafts), for the AI to judge. */
export function defectCandidates(
  findings: Array<{ title?: string | null; observation?: string | null; severity?: string | null; needs_review?: boolean | null; section?: string | null }>,
  max = 40,
): Array<{ title: string; severity: string; observation: string; section: string }> {
  return (findings || [])
    .filter((f) => f?.needs_review !== true)
    .filter((f) => {
      const severity = String(f?.severity || "").trim();
      return severity && !NON_DEFECT.test(severity);
    })
    .slice(0, max)
    .map((f) => ({
      title: String(f?.title || "Finding").trim(),
      severity: String(f?.severity || "").trim(),
      observation: String(f?.observation || "").replace(/\s+/g, " ").trim().slice(0, 240),
      section: String(f?.section || "").trim(),
    }));
}

type LimitationRow = {
  label?: string | null;
  limitation_comment?: string | null;
  custom_text?: string | null;
  section?: string | null;
  needs_review?: boolean | null;
};

function limitationText(l: LimitationRow): string {
  return [l?.label, l?.custom_text, l?.limitation_comment]
    .map((v) => String(v || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ");
}

/**
 * Limitations on the report that are about this equipment type — e.g. "Water
 * heater not tested: gas supply off" — so the equipment doesn't read as
 * checked-and-fine when it couldn't actually be evaluated.
 */
export function relatedLimitations(equipmentType: string, limitations: LimitationRow[]): string[] {
  const words = keywordsFor(equipmentType);
  if (!words.length) return [];
  const out: string[] = [];
  for (const l of limitations || []) {
    if (l?.needs_review === true) continue;
    const text = limitationText(l);
    if (text && mentionsAny(words, text)) out.push(text.slice(0, 200));
  }
  return Array.from(new Set(out));
}

/** Every saved limitation on the report, for the AI to judge. */
export function limitationCandidates(limitations: LimitationRow[], max = 30): Array<{ text: string; section: string }> {
  return (limitations || [])
    .filter((l) => l?.needs_review !== true)
    .map((l) => ({ text: limitationText(l).slice(0, 240), section: String(l?.section || "").trim() }))
    .filter((l) => l.text)
    .slice(0, max);
}

export const LIMITATION_STATUS = "⚠ Not Fully Evaluated – See Limitations";

/** Condition sentence for equipment that couldn't be fully evaluated. */
export function limitationConditionText(limitations: string[]): string {
  const first = Array.from(new Set(limitations.filter(Boolean))).slice(0, 2);
  return first.length
    ? `Not fully evaluated — see the report limitation${first.length === 1 ? "" : "s"}: ${first.join("; ")}.`
    : "Not fully evaluated — see the report limitations.";
}

export const DEFICIENCY_STATUS = "⚠ Deficiency Noted – See Report Findings";

/** Condition line for equipment that has related defects written up. */
export function deficiencyConditionText(related: Array<{ title: string }>): string {
  const titles = Array.from(new Set(related.map((r) => r.title).filter(Boolean))).slice(0, 3);
  return titles.length
    ? `Deficiencies noted — see the report finding${titles.length === 1 ? "" : "s"}: ${titles.join("; ")}.`
    : "Deficiencies noted — see the related report findings.";
}
