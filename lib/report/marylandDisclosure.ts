// Maryland home inspection report disclosure — Md. Code, Business Occupations
// and Professions § 16-4A-01(a)(4). Every home inspection report for a Maryland
// property (full, limited-scope, agent, summary — every view and PDF) must
// contain these four statements in 14-point bold type. Applied ONLY to
// Maryland properties; other states never get it. Text is verbatim — do not
// reword. Matches the Commission's published text exactly (no closing periods).

import { normalizeStateCode } from "../usStates";
import { licenseForState, sanitizeStateLicenses } from "../stateLicenses";
import { isMarylandWalkthrough, mdWalkthroughNoticeHtml } from "./serviceScope";

export const MD_REPORT_DISCLOSURE_STATEMENTS: readonly string[] = [
  "An inspection is intended to assist in the evaluation of the overall condition of a building. The inspection is based on observation of the visible and apparent condition of the building and its components on the date of the inspection",
  "The results of this home inspection are not intended to make any representation regarding latent or concealed defects that may exist, and no warranty or guaranty is expressed or implied",
  "If your home inspector is not a licensed structural engineer or other professional whose license authorizes the rendering of an opinion as to structural integrity of a building or the condition of its components or systems, you may wish to seek the professional opinion of a licensed structural engineer or other professional regarding any possible defects or other observations set forth in this report",
  "Only home inspections performed by Maryland licensed home inspectors will be recognized as a valid home inspection under a real estate contract",
];

/** 14-point bold, as the statute requires (CSS points render as true points in print/PDF). */
export const MD_DISCLOSURE_FONT_SIZE = "14pt";

/**
 * The inspection's property state as a 2-letter code: the state column, else
 * the "ST 12345" at the end of the property address. "" when unknown.
 */
export function inspectionStateCode(inspection: Record<string, any> | null | undefined): string {
  const direct = normalizeStateCode(inspection?.state ?? inspection?.property_state);
  if (direct) return direct;
  const address = [inspection?.property_address, inspection?.address, inspection?.full_address]
    .map((v) => String(v || ""))
    .find(Boolean);
  const match = address ? /\b([A-Za-z]{2})\.?\s+\d{5}(?:-\d{4})?\s*$/.exec(address.trim()) : null;
  return match ? normalizeStateCode(match[1]) : "";
}

/**
 * True only for a Maryland home inspection — never other states. A Maryland
 * walkthrough is a consultation (not a home inspection), so it gets the
 * consultation notice instead of this disclosure.
 */
export function needsMarylandDisclosure(inspection: Record<string, any> | null | undefined): boolean {
  const state = inspectionStateCode(inspection);
  return state === "MD" && !isMarylandWalkthrough(inspection, state);
}

/** What Maryland notice a report gets: the statutory disclosure, the walkthrough-consultation notice, or none. */
export function marylandReportNotice(
  inspection: Record<string, any> | null | undefined,
): "disclosure" | "walkthrough" | null {
  const state = inspectionStateCode(inspection);
  if (state !== "MD") return null;
  return isMarylandWalkthrough(inspection, state) ? "walkthrough" : "disclosure";
}

/** The Maryland block for the PDFs: disclosure, walkthrough notice, or "" for other states. */
export function marylandReportNoticeHtml(inspection: Record<string, any> | null | undefined, license: string): string {
  const kind = marylandReportNotice(inspection);
  if (kind === "walkthrough") return mdWalkthroughNoticeHtml();
  if (kind === "disclosure") return marylandDisclosureHtml(license);
  return "";
}

/** The Maryland license line for the report: the company's MD number, else its general license. */
export function marylandLicenseFor(
  company: Record<string, any> | null | undefined,
  fallbackLicense?: string | null,
): string {
  return licenseForState(
    String(company?.license_info || fallbackLicense || ""),
    sanitizeStateLicenses(company?.state_licenses),
    "MD",
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The disclosure block as HTML for the server-rendered PDFs (inline styles survive any report CSS). */
export function marylandDisclosureHtml(license: string): string {
  const statements = MD_REPORT_DISCLOSURE_STATEMENTS.map(
    (text, i) =>
      `<p style="font-size:${MD_DISCLOSURE_FONT_SIZE} !important;font-weight:700 !important;line-height:1.35;margin:0 0 10pt 0;">${i + 1}. ${escapeHtml(text)}</p>`,
  ).join("");
  const licenseLine = license
    ? `<p style="font-size:${MD_DISCLOSURE_FONT_SIZE} !important;font-weight:700 !important;margin:12pt 0 0 0;">Maryland Home Inspector License No.: ${escapeHtml(license)}</p>`
    : "";
  return `<div class="md-disclosure" style="border:2px solid #111;border-radius:8px;padding:14pt;margin:12pt 0;break-inside:avoid;page-break-inside:avoid;">
  <p style="font-size:${MD_DISCLOSURE_FONT_SIZE} !important;font-weight:700 !important;margin:0 0 10pt 0;text-transform:uppercase;">Maryland Home Inspection Disclosure</p>
  ${statements}${licenseLine}
</div>`;
}
