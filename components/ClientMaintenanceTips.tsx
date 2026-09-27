import {
  MAINTENANCE_DISCLAIMER,
  maintenanceForSections,
} from "../lib/maintenanceTips";

// Client-facing "Home Maintenance Tips" section on the shared report. A courtesy
// guide (HVAC filters, water heater, gutters, safety, etc.) with typical
// intervals — not part of the inspection findings. Server component (static
// content), styled with the report's fl-* tokens so it works in light + dark.
//
// - `sections` are the report's actual inspected sections; categories are
//   filtered so a home without HVAC never shows HVAC tips, etc.
// - `print:hidden` keeps this courtesy guide out of the PDF report.
export default function ClientMaintenanceTips({
  sections = [],
}: {
  sections?: string[];
}) {
  const categories = maintenanceForSections(sections);
  if (categories.length === 0) return null;

  return (
    <section
      id="maintenance-tips"
      data-command-target="maintenance-tips"
      className="mt-8 scroll-mt-[180px] rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 shadow-xl md:scroll-mt-[220px] sm:p-6 print:hidden"
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-accent-text)]">
          Courtesy Guide
        </p>
        <h2 className="mt-1 text-2xl font-bold text-[var(--fl-text)]">
          🔧 Home Maintenance Tips
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
          Simple, routine upkeep to help keep your home running smoothly. These are
          typical intervals — how often you actually need each task varies with your
          equipment, how the home is used, and local conditions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map((cat) => (
          <div
            key={cat.key}
            className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
          >
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--fl-text)]">
              <span aria-hidden>{cat.icon}</span>
              {cat.title}
            </h3>

            <ul className="mt-3 space-y-3">
              {cat.tips.map((tip, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--fl-text)]">
                      {tip.task}
                    </span>
                    <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--fl-accent-text)]">
                      {tip.cadence}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-6 text-[var(--fl-muted)]">
                    {tip.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-[var(--fl-faint)]">{MAINTENANCE_DISCLAIMER}</p>
    </section>
  );
}
