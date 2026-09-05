// Per-user dashboard layout — order, size, and visibility of the inspector
// dashboard widgets. Stored in profiles.dashboard_layout (jsonb) so it follows
// the user across devices. The hero + setup checklist stay pinned above the
// customizable grid and are not part of this layout.

export type WidgetSize = "full" | "half" | "third";
export type WidgetLayout = { id: string; size: WidgetSize; visible: boolean };
export type DashboardLayout = WidgetLayout[];

// The customizable widgets, in their default order. `id` is stable; adding a
// new widget here makes it show up (at the end) for everyone automatically.
// `defaultVisible: false` keeps a widget OFF the default dashboard (a ruthless,
// clean default) while still letting users add it back in edit mode — the
// dashboard leads with money + pipeline + what's next, not a wall of modules.
export const DASHBOARD_WIDGETS: {
  id: string;
  title: string;
  defaultSize: WidgetSize;
  defaultVisible?: boolean;
}[] = [
  { id: "kpis", title: "Revenue & Status", defaultSize: "full" },
  { id: "pipeline", title: "Pipeline", defaultSize: "full" },
  { id: "next-attention", title: "Next Up & Needs Attention", defaultSize: "full" },
  { id: "active-jobs", title: "Active Jobs", defaultSize: "full", defaultVisible: false },
  { id: "trends", title: "Trends", defaultSize: "half", defaultVisible: false },
  { id: "activity-metrics", title: "Engagement", defaultSize: "full", defaultVisible: false },
  { id: "recent-tools", title: "Recent Activity & Tools", defaultSize: "full", defaultVisible: false },
  { id: "email-activity", title: "Email Activity", defaultSize: "full", defaultVisible: false },
];

export const WIDGET_IDS = DASHBOARD_WIDGETS.map((w) => w.id);
export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w.title]),
);

export const DEFAULT_LAYOUT: DashboardLayout = DASHBOARD_WIDGETS.map((w) => ({
  id: w.id,
  size: w.defaultSize,
  visible: w.defaultVisible !== false,
}));

const SIZES: WidgetSize[] = ["full", "half", "third"];

// Coerce a stored/blob layout into a valid one: drops unknown ids, dedupes,
// then appends any known widgets missing from the saved layout (new widgets)
// at their defaults — so the layout self-heals as widgets are added/removed.
export function normalizeLayout(raw: any): DashboardLayout {
  const known = new Set(WIDGET_IDS);
  const seen = new Set<string>();
  const out: DashboardLayout = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = String(item?.id || "");
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      const size: WidgetSize = SIZES.includes(item?.size) ? item.size : "full";
      out.push({ id, size, visible: item?.visible !== false });
    }
  }

  for (const w of DASHBOARD_WIDGETS) {
    if (!seen.has(w.id)) out.push({ id: w.id, size: w.defaultSize, visible: w.defaultVisible !== false });
  }

  return out;
}

// The lg-and-up column span for a size (12-col grid). Mobile always stacks full.
export function sizeColSpanClass(size: WidgetSize): string {
  return size === "third" ? "lg:col-span-4" : size === "half" ? "lg:col-span-6" : "lg:col-span-12";
}

// Resize step: full -> half -> third -> full.
export function nextSize(size: WidgetSize): WidgetSize {
  return size === "full" ? "half" : size === "half" ? "third" : "full";
}
