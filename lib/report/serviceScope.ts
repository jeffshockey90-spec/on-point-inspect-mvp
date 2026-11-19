// Which service a job is, and what its report should say about scope.
//
// - Limited-scope services (e.g. Mechanical & Structural) get a "Scope of This
//   Inspection" section listing what was and was NOT inspected. Maryland's
//   Commission requires a limited-scope report to state both. The lists come
//   from the service's own settings (Settings > Pricing); a service named
//   "Mechanical & Structural" with nothing set uses the defaults below, which
//   match the Mechanical & Structural agreements.
// - Walkthrough services ("Pre-Offer Verbal Walkthrough", "walk-and-talk") in
//   Maryland are consultations, not home inspections: the Commission says a
//   walk-and-talk without a written evaluation may not be called one.
// Pure helpers.

import type { InspectorPricingConfig, PricingService } from "../inspectorPricing";

export type ReportScope = { serviceName: string; included: string[]; excluded: string[] };

export const MECHANICAL_STRUCTURAL_DEFAULT_SCOPE = {
  included: [
    "Structure: visible foundation, framing, beams, columns, floor and roof framing, and accessible basement, crawlspace, and attic areas",
    "Roof: visible coverings, flashing, penetrations, and gutters/downspouts (viewed from safe vantage points)",
    "Exterior: wall coverings, trim, exterior doors, a representative number of windows, attached decks, porches, steps, and railings, and grading/drainage at the building",
    "Electrical: service entrance, panels, visible wiring, and a representative number of receptacles, switches, and GFCI/AFCI devices",
    "Plumbing: visible supply and drain/waste/vent piping, fixtures, water heater, and accessible sump pump",
    "Heating, cooling, and ventilation: installed equipment, normal controls, distribution, venting, condensate, and exhaust fans",
    "Interior doors and windows (representative) and interior signs of structural distress or moisture",
  ],
  excluded: [
    "Built-in and freestanding appliances",
    "Cosmetic conditions, finishes, cabinets, and countertops",
    "Insulation adequacy and energy evaluation",
    "Fireplaces, chimney interiors/flues, and solid-fuel appliances",
    "Smoke and carbon monoxide alarm testing",
    "Pools, spas, fences, and detached outbuildings",
    "Radon, mold, asbestos, lead, pests, and wood-destroying organisms",
    "Water quality, private wells, sewer lines, and septic systems",
    "Low-voltage, security, and data systems",
    "Code compliance, permits, and engineering analysis",
  ],
};

// Same key rule as agreementTemplates.canonicalServiceKey (kept local so the
// Settings screen can import this file without the server agreement code).
const canonicalServiceKey = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const serviceLabelForKey = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const MECH_STRUCT = /mechanical\s*(?:&|and|\+)?\s*structural/i;
const WALKTHROUGH = /walk\s*-?\s*through|walk\s*-?\s*(?:and|&|n)\s*-?\s*talk/i;

/** The job's main service name ("Mechanical & Structural", "Pre Offer Verbal Walkthrough"…), or "". */
export function jobServiceName(inspection: Record<string, any> | null | undefined): string {
  const mode = String(inspection?.service_mode || "").trim();
  if (mode) return serviceLabelForKey(canonicalServiceKey(mode));
  return String(inspection?.service_type || inspection?.inspection_type || inspection?.services || "").trim();
}

/** The job's service in the inspector's price sheet (matched by name key), or null. */
export function findJobService(
  config: InspectorPricingConfig | null | undefined,
  inspection: Record<string, any> | null | undefined,
): PricingService | null {
  const mode = canonicalServiceKey(inspection?.service_mode);
  if (!mode || !config?.services?.length) return null;
  return config.services.find((s) => canonicalServiceKey(s.name) === mode || canonicalServiceKey(s.id) === mode) || null;
}

const lines = (text: unknown) =>
  String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);

/** The "Scope of This Inspection" lists for a limited-scope job, or null for a full inspection. */
export function reportScopeFor(
  config: InspectorPricingConfig | null | undefined,
  inspection: Record<string, any> | null | undefined,
): ReportScope | null {
  const service = findJobService(config, inspection);
  const serviceName = service?.name || jobServiceName(inspection);
  const included = lines(service?.reportScope?.included);
  const excluded = lines(service?.reportScope?.excluded);
  if (included.length || excluded.length) return { serviceName, included, excluded };
  if (MECH_STRUCT.test(serviceName)) {
    return {
      serviceName,
      included: [...MECHANICAL_STRUCTURAL_DEFAULT_SCOPE.included],
      excluded: [...MECHANICAL_STRUCTURAL_DEFAULT_SCOPE.excluded],
    };
  }
  return null;
}

/**
 * A verbal-only service ("Pre Offer Verbal Walkthrough"): its agreement promises
 * NO written report, so FLOW never publishes or sends one for these jobs.
 */
export function isVerbalOnlyService(name: string): boolean {
  return /\bverbal\b/i.test(String(name || ""));
}

export function isVerbalOnlyJob(inspection: Record<string, any> | null | undefined): boolean {
  return isVerbalOnlyService(jobServiceName(inspection));
}

export function isWalkthroughService(name: string): boolean {
  return WALKTHROUGH.test(String(name || ""));
}

export const WALKTHROUGH_NOUN = "Walkthrough Consultation";

/** Any walkthrough job, any state: it's a consultation, not an inspection. */
export function isWalkthroughJob(inspection: Record<string, any> | null | undefined): boolean {
  return isWalkthroughService(jobServiceName(inspection));
}

/** Maryland walkthrough job: a consultation, not a home inspection. */
export function isMarylandWalkthrough(inspection: Record<string, any> | null | undefined, stateCode: string): boolean {
  return stateCode === "MD" && isWalkthroughService(jobServiceName(inspection));
}

export const MD_WALKTHROUGH_TITLE = "Walkthrough Consultation";
export const MD_WALKTHROUGH_NOTICE =
  "This walkthrough is a consultation and is not a home inspection under Maryland law (Business Occupations and Professions Article, § 16-101(i)). These notes are not a home inspection report. For a home inspection, a Maryland licensed home inspector must perform the inspection and provide a written report.";

/** The report's title for this job: walkthroughs (every state) are consultations. */
export function reportTitleFor(inspection: Record<string, any> | null | undefined, stateCode: string, fallback: string): string {
  void stateCode;
  return isWalkthroughJob(inspection) ? MD_WALKTHROUGH_TITLE : fallback;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Scope section HTML for the server-rendered PDFs. */
export function reportScopeHtml(scope: ReportScope): string {
  const list = (items: string[]) =>
    items.length
      ? `<ul style="margin:6px 0 0 18px;padding:0;">${items.map((i) => `<li style="margin:3px 0;">${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<p style="margin:6px 0 0 0;">None listed.</p>`;
  return `<div class="report-scope" style="border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin:12px 0;break-inside:avoid;page-break-inside:avoid;font-size:11px;line-height:1.45;">
  <p style="font-size:14px;font-weight:800;margin:0 0 4px 0;">Scope of This Inspection — ${escapeHtml(scope.serviceName || "Limited-Scope Inspection")}</p>
  <p style="margin:0 0 8px 0;">This is a limited-scope inspection, not a complete home inspection. Only the systems and components listed as inspected were evaluated.</p>
  <p style="font-weight:700;margin:8px 0 0 0;">Inspected</p>${list(scope.included)}
  <p style="font-weight:700;margin:10px 0 0 0;">Not inspected</p>${list(scope.excluded)}
</div>`;
}

/** Walkthrough-consultation notice HTML for the PDFs (Maryland). */
export function mdWalkthroughNoticeHtml(): string {
  return `<div class="md-walkthrough-notice" style="border:2px solid #111;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:13px;font-weight:700;line-height:1.45;break-inside:avoid;page-break-inside:avoid;">${escapeHtml(MD_WALKTHROUGH_NOTICE)}</div>`;
}
