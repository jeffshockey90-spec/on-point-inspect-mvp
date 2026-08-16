// AI Writing Studio — shared, client-safe types + prompt builder.
// NO secrets and NO supabase imports here, so this file is safe to import from
// both server (AI routes) and client (the settings editor / live preview).
// The server-only loader that reads a company's saved config lives in
// lib/ai/loadWritingConfig.ts.

export type SopStandard = "InterNACHI" | "ASHI";
export type WritingLength = "short" | "normal" | "long";
export type WritingDetail = "simplified" | "detailed";
export type WritingTone = "reassuring" | "balanced" | "clinical";

// The 6 canonical severities used across the app (see app/field/page.tsx and
// lib/routeFindingSection.ts normalizeSeverity). Keep these strings exact.
export const SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
] as const;
export type Severity = (typeof SEVERITIES)[number];

// A per-severity override either inherits the global defaults or sets its own.
export type SeverityOverride = {
  inherit: boolean;
  length: WritingLength;
  detail: WritingDetail;
  tone: WritingTone;
};

export type AiWritingConfig = {
  sopStandard: SopStandard;
  length: WritingLength;
  detail: WritingDetail;
  tone: WritingTone;
  severityOverrides: Record<Severity, SeverityOverride>;
};

export const SOP_OPTIONS: { value: SopStandard; label: string }[] = [
  { value: "InterNACHI", label: "InterNACHI" },
  { value: "ASHI", label: "ASHI" },
];

export const LENGTH_OPTIONS: { value: WritingLength; label: string; hint: string }[] = [
  { value: "short", label: "Short", hint: "1–2 sentences" },
  { value: "normal", label: "Normal", hint: "2–4 sentences" },
  { value: "long", label: "Long", hint: "4–6 sentences" },
];

export const DETAIL_OPTIONS: { value: WritingDetail; label: string; hint: string }[] = [
  { value: "simplified", label: "Simplified", hint: "Plain, client-friendly wording" },
  { value: "detailed", label: "Detailed", hint: "Full narrative with implications & risk chain" },
];

export const TONE_OPTIONS: { value: WritingTone; label: string; hint: string }[] = [
  { value: "reassuring", label: "Reassuring", hint: "Calm and non-alarmist — avoids scary language" },
  { value: "balanced", label: "Balanced", hint: "Factual and neutral (default)" },
  { value: "clinical", label: "Clinical", hint: "Precise and technical" },
];

function defaultOverride(): SeverityOverride {
  return { inherit: true, length: "normal", detail: "detailed", tone: "balanced" };
}

export const DEFAULT_AI_WRITING_CONFIG: AiWritingConfig = {
  sopStandard: "InterNACHI",
  length: "normal",
  detail: "detailed",
  tone: "balanced",
  severityOverrides: SEVERITIES.reduce((acc, sev) => {
    acc[sev] = defaultOverride();
    return acc;
  }, {} as Record<Severity, SeverityOverride>),
};

// Coerce any stored/partial object into a complete, valid config (defensive:
// handles older rows or missing keys without throwing).
export function normalizeWritingConfig(raw: any): AiWritingConfig {
  const base = DEFAULT_AI_WRITING_CONFIG;
  const cfg = raw && typeof raw === "object" ? raw : {};

  const sopStandard: SopStandard =
    cfg.sopStandard === "ASHI" ? "ASHI" : "InterNACHI";
  const length: WritingLength = ["short", "normal", "long"].includes(cfg.length)
    ? cfg.length
    : base.length;
  const detail: WritingDetail = ["simplified", "detailed"].includes(cfg.detail)
    ? cfg.detail
    : base.detail;
  const tone: WritingTone = ["reassuring", "balanced", "clinical"].includes(cfg.tone)
    ? cfg.tone
    : base.tone;

  const overridesRaw = cfg.severityOverrides || {};
  const severityOverrides = SEVERITIES.reduce((acc, sev) => {
    const o = overridesRaw[sev] || {};
    acc[sev] = {
      inherit: o.inherit !== false, // default to inheriting
      length: ["short", "normal", "long"].includes(o.length) ? o.length : length,
      detail: ["simplified", "detailed"].includes(o.detail) ? o.detail : detail,
      tone: ["reassuring", "balanced", "clinical"].includes(o.tone) ? o.tone : tone,
    };
    return acc;
  }, {} as Record<Severity, SeverityOverride>);

  return { sopStandard, length, detail, tone, severityOverrides };
}

const LENGTH_TEXT: Record<WritingLength, string> = {
  short: "Keep each narrative to 1–2 tight sentences.",
  normal: "Keep each narrative to about 2–4 sentences.",
  long: "Allow 4–6 sentences when the condition warrants the detail.",
};

const DETAIL_TEXT: Record<WritingDetail, string> = {
  simplified: "Use plain, client-friendly wording with minimal jargon; state the condition and the fix without a long technical chain.",
  detailed: "Write a full narrative that includes the implication and the risk chain (what happens if it is not corrected).",
};

const TONE_TEXT: Record<WritingTone, string> = {
  reassuring:
    "Use a calm, measured, non-alarmist tone. Report facts plainly and avoid dramatic, fear-based, or worst-case language. Do not downplay genuine safety issues, but describe them without scaring the reader.",
  balanced: "Use a factual, neutral, professional tone.",
  clinical: "Use a precise, technical tone appropriate for a detailed compliance-style report.",
};

// Builds the style instruction block injected into a finding-writer system
// prompt. Includes global defaults plus a per-severity override table so the
// model applies the row matching whatever severity it assigns.
export function buildWritingStyleInstructions(config: AiWritingConfig): string {
  const c = normalizeWritingConfig(config);

  const overrideLines = SEVERITIES.map((sev) => {
    const o = c.severityOverrides[sev];
    if (o.inherit) return `- ${sev}: use the defaults above.`;
    return `- ${sev}: length ${o.length}; ${o.detail}; ${o.tone} tone.`;
  }).join("\n");

  return `
COMPANY WRITING STYLE — apply to the title, observation, implication, and recommendation.
These are wording preferences ONLY. Never invent, exaggerate, downplay, or omit evidence to satisfy them, and never soften a genuine life-safety issue into something it is not.
- Standards framing: where appropriate, frame recommendations in language consistent with the ${c.sopStandard} Standards of Practice.
- Default length: ${LENGTH_TEXT[c.length]}
- Default detail: ${DETAIL_TEXT[c.detail]}
- Default tone: ${TONE_TEXT[c.tone]}
Per-severity adjustments (apply the row matching the severity you assign; otherwise use the defaults above):
${overrideLines}

Wording discipline (always apply):
- Reserve the word "structural" for genuine structural components or defects — foundation, footings, framing, load-bearing beams/joists/headers/columns, or clear evidence of movement or settlement. A crack in drywall, plaster, stucco, brick veneer, a slab, tile, a driveway, or any cosmetic surface is NOT "structural."
- When you are unsure whether a condition is structural, describe exactly what is visible and recommend evaluation by a qualified professional — do NOT label it "structural."
- Prefer the specific component name (e.g., "drywall crack," "settlement crack in the garage slab") over generic alarming words, and never use "structural" to add urgency.
`.trim();
}

// Resolve the effective settings for a given severity (used by the live preview
// and by any per-severity presentation).
export function resolveForSeverity(
  config: AiWritingConfig,
  severity: Severity,
): { length: WritingLength; detail: WritingDetail; tone: WritingTone } {
  const c = normalizeWritingConfig(config);
  const o = c.severityOverrides[severity];
  if (!o || o.inherit) {
    return { length: c.length, detail: c.detail, tone: c.tone };
  }
  return { length: o.length, detail: o.detail, tone: o.tone };
}

// Client-safe illustrative preview. Generates a representative water-heater
// finding whose wording shifts with the chosen settings. Clearly a sample —
// the real narratives are written per-finding by the AI. Mirrors how AEYES-style
// studios show a "sample defect for illustration".
export function buildPreviewNarrative(
  config: AiWritingConfig,
  severity: Severity = "Recommended Repair",
): { title: string; body: string; meta: string } {
  const { length, detail, tone } = resolveForSeverity(config, severity);
  const sop = normalizeWritingConfig(config).sopStandard;

  const title = "Water Heater — Missing TPR Discharge Pipe";

  const observation =
    tone === "reassuring"
      ? "The water heater's temperature and pressure relief (TPR) valve does not have a discharge pipe installed."
      : "The temperature and pressure relief (TPR) valve on the water heater is missing its discharge pipe.";

  const implication =
    detail === "detailed"
      ? tone === "reassuring"
        ? " This valve is a safety device; if the tank ever over-pressurizes it is meant to release, and a discharge pipe directs that water safely toward the floor."
        : " The TPR valve is a key safety device — if the tank overheats or builds excess pressure it opens and releases scalding water. Without a discharge pipe, that release could spray out at roughly chest height and create a burn hazard for anyone nearby."
      : "";

  const recommendation =
    tone === "reassuring"
      ? " We recommend having a qualified plumbing contractor add a proper discharge pipe extending to within about 6 inches of the floor."
      : " We recommend a qualified plumbing contractor install a proper discharge pipe extending to within 6 inches of the floor.";

  let body = observation + implication + recommendation;

  // Length trims/keeps the middle detail to approximate sentence counts.
  if (length === "short") {
    body = observation + recommendation;
  }

  const meta = `${sop} · ${length} · ${detail} · ${tone}`;
  return { title, body: body.trim(), meta };
}
