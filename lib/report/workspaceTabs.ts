// Report builder workspace tabs. The builder used to be one long scroll of ~30
// panels; it's now split into three tabs and only the active tab is rendered.
// Links elsewhere in the app (status chips, "next step", command targets) still
// point at in-page anchors, so this maps each anchor to the tab that renders it.

export type WorkspaceTab = "write" | "client" | "insights";

export const WORKSPACE_TABS: { key: WorkspaceTab; label: string }[] = [
  { key: "write", label: "Write" },
  { key: "client", label: "Client & payment" },
  { key: "insights", label: "Insights" },
];

export function normalizeWorkspaceTab(value: unknown): WorkspaceTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "client" || raw === "insights" ? raw : "write";
}

const CLIENT_ANCHORS = new Set([
  "client-contacts",
  "report-disclaimers",
  "agreement-status",
  "payment-invoice",
  "report-delivery-guard",
  "defect-totals",
  "equipment-inventory",
]);

const INSIGHTS_ANCHORS = new Set(["ai-insights"]);

const WRITE_ANCHORS = new Set(["report-actions", "report-findings", "executive-summary"]);

/** The tab that renders an anchor id, or null when it isn't tab-scoped. */
export function tabForAnchor(anchor: string): WorkspaceTab | null {
  const id = String(anchor || "").replace(/^#/, "");
  if (!id) return null;
  if (CLIENT_ANCHORS.has(id)) return "client";
  if (INSIGHTS_ANCHORS.has(id)) return "insights";
  if (WRITE_ANCHORS.has(id) || id.startsWith("report-section-")) return "write";
  return null;
}

/** Matches ReportFindingsSortable's `report-section-<slug>` section ids. */
export function sectionAnchorId(section: unknown): string {
  const slug = String(section || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `report-section-${slug}`;
}

/** Href to a report builder tab, optionally scrolled to an anchor in it. */
export function workspaceTabHref(tab: WorkspaceTab, anchor?: string): string {
  const hash = anchor ? `#${anchor.replace(/^#/, "")}` : "";
  return `?tab=${tab}${hash}`;
}
