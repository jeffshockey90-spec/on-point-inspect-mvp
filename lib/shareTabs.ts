// Which shared-report tab a link hash belongs to. Shared by the tab bar's click
// handler AND its first-load handling: a link arriving with a hash (e.g. an
// emailed /share/<token>#finding-123) used to land on Summary with the target
// panel hidden, because only in-page clicks switched tabs.
export type ShareTab =
  | "summary"
  | "full"
  | "disclaimers"
  | "standards"
  | "equipment"
  | "priority"
  | "maintenance";

export function tabForHash(hash: string): ShareTab | null {
  const h = String(hash || "");
  if (h === "#client-summary" || h.startsWith("#client-summary-")) return "summary";
  if (h === "#priority-repairs") return "priority";
  if (h === "#maintenance-tips") return "maintenance";
  if (h === "#report-disclaimers") return "disclaimers";
  if (h === "#standards-of-practice") return "standards";
  if (h === "#equipment-inventory") return "equipment";
  if (
    h === "#inspection-findings" ||
    h === "#report-limitations" ||
    h.startsWith("#section-") ||
    h.startsWith("#finding-")
  ) {
    return "full";
  }
  return null;
}

/**
 * The tab to open first: the requested one, except Summary when the report has
 * no summary panel (a clean report with no defects) — that used to hide every
 * panel and leave a blank page under the tab bar.
 */
export function resolveInitialTab(requested: ShareTab, showSummary: boolean): ShareTab {
  return requested === "summary" && !showSummary ? "full" : requested;
}
