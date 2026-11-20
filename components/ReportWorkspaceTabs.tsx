import Link from "next/link";
import { WORKSPACE_TABS, workspaceTabHref, type WorkspaceTab } from "../lib/report/workspaceTabs";

// Top-level report builder tabs. Server-rendered links: switching tabs re-renders
// the page with only that tab's panels, so each tab loads less.
export default function ReportWorkspaceTabs({
  active,
  badges,
}: {
  active: WorkspaceTab;
  badges?: Partial<Record<WorkspaceTab, string>>;
}) {
  return (
    <nav
      aria-label="Report builder sections"
      className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-1.5 shadow-lg"
    >
      {WORKSPACE_TABS.map((tab) => {
        const isActive = tab.key === active;
        const badge = badges?.[tab.key];
        return (
          <Link
            key={tab.key}
            href={workspaceTabHref(tab.key)}
            scroll={false}
            prefetch
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition [touch-action:manipulation] sm:flex-none sm:px-5 ${
              isActive
                ? "bg-teal-500/15 text-[var(--fl-accent-text)] ring-1 ring-teal-400/60"
                : "text-[var(--fl-muted)] hover:bg-[var(--fl-surface-2)] hover:text-[var(--fl-text)]"
            }`}
          >
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {badge ? (
              <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fl-muted)]">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
