import { sectionAnchorId } from "../lib/report/workspaceTabs";

// Quick jump to a report section, with its finding count. Chips wrap on narrow
// screens so nothing scrolls sideways.
export default function ReportSectionJumpList({
  sections,
  extra,
}: {
  sections: { section: string; count: number }[];
  extra?: { label: string; href: string }[];
}) {
  if (sections.length === 0 && !extra?.length) return null;
  return (
    <nav aria-label="Jump to report section" className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Jump to section</p>
      <div className="flex flex-wrap gap-2">
        {extra?.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex min-h-9 items-center rounded-full border border-purple-500/40 bg-[var(--fl-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-purple-text)] transition hover:bg-purple-500/10 [touch-action:manipulation]"
          >
            {item.label}
          </a>
        ))}
        {sections.map(({ section, count }) => (
          <a
            key={section}
            href={`#${sectionAnchorId(section)}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)] [touch-action:manipulation]"
          >
            <span className="max-w-[14rem] truncate">{section}</span>
            <span
              className={`rounded-full px-1.5 text-[11px] ${
                count > 0 ? "bg-teal-500/15 text-[var(--fl-accent-text)]" : "text-[var(--fl-faint)]"
              }`}
            >
              {count}
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}
