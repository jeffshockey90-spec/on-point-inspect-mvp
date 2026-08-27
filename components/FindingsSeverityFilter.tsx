"use client";

import { useState } from "react";

// Instant, client-side severity filter for the web report's findings list.
// It flips a data-filter attribute on the #inspection-findings container; the
// CSS in the report page (which uses :has) hides non-matching findings and any
// section left empty — no page reload. The URL is updated (replaceState) so the
// current view is still shareable, matching the server-side ?defect_filter.
const CHIPS = [
  { key: "all", label: "All" },
  { key: "safety", label: "Safety / Major" },
  { key: "repair", label: "Recommended Repair" },
  { key: "maintenance", label: "Maintenance" },
  { key: "information", label: "Informational" },
] as const;

export default function FindingsSeverityFilter({
  initial = "all",
  counts,
}: {
  initial?: string;
  counts: Record<string, number>;
}) {
  const [active, setActive] = useState(initial);

  function apply(key: string) {
    setActive(key);
    const el = document.getElementById("inspection-findings");
    if (el) el.setAttribute("data-filter", key);
    try {
      const url = new URL(window.location.href);
      if (key === "all") url.searchParams.delete("defect_filter");
      else url.searchParams.set("defect_filter", key);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* URL update is best-effort; the filter still applies. */
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter findings by severity">
      {CHIPS.map((chip) => {
        const count = counts[chip.key] ?? 0;
        // Hide a severity chip with nothing to show (keep "All" always).
        if (chip.key !== "all" && count === 0) return null;
        const isActive = active === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => apply(chip.key)}
            aria-pressed={isActive}
            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              isActive
                ? "border-teal-400 bg-teal-500/20 text-[var(--fl-accent-text)]"
                : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)] hover:border-teal-500/60 hover:text-[var(--fl-accent-text)]"
            }`}
          >
            {chip.label}
            <span className={`ml-1.5 ${isActive ? "text-[var(--fl-accent-text)]" : "text-[var(--fl-faint)]"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
