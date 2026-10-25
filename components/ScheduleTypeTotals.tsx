"use client";

import { useMemo, useState } from "react";

type Row = { date: string | null; type: string };
type Period = "week" | "month" | "year";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

// Local YYYY-MM-DD for a date (avoids UTC shifting the day).
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Start of the period that contains `today` (week starts Sunday).
function periodStart(today: Date, period: Period) {
  const d = new Date(today);
  if (period === "week") {
    d.setDate(d.getDate() - d.getDay()); // back to Sunday
  } else if (period === "month") {
    d.setDate(1);
  } else {
    d.setMonth(0, 1); // Jan 1
  }
  return ymd(d);
}

// Per-type counts of inspections DONE in the selected period (dated from the
// period start through today). Lives on the Schedule page so the inspector can
// see how many of each inspection type they've done this week / month / year.
export default function ScheduleTypeTotals({ inspections }: { inspections: Row[] }) {
  const [period, setPeriod] = useState<Period>("month");

  const { rows, total } = useMemo(() => {
    const today = new Date();
    const todayStr = ymd(today);
    const startStr = periodStart(today, period);

    const counts = new Map<string, number>();
    let total = 0;
    for (const insp of inspections) {
      const date = insp.date ? String(insp.date).slice(0, 10) : "";
      if (!date || date < startStr || date > todayStr) continue;
      const type = String(insp.type || "Home Inspection").trim() || "Home Inspection";
      counts.set(type, (counts.get(type) || 0) + 1);
      total += 1;
    }
    const rows = Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    return { rows, total };
  }, [inspections, period]);

  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section className="mb-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[var(--fl-text)]">Inspections by type</h2>
          <p className="mt-0.5 text-sm text-[var(--fl-muted)]">
            {total} inspection{total === 1 ? "" : "s"} done {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition [touch-action:manipulation] ${
                period === p.key
                  ? "bg-teal-500 text-slate-950"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-5 text-center text-sm text-[var(--fl-muted)]">
          No inspections done {PERIODS.find((p) => p.key === period)?.label.toLowerCase()} yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.type} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm font-semibold text-[var(--fl-text)]" title={r.type}>
                {r.type}
              </span>
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--fl-ground)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-teal-500"
                  style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--fl-text)]">
                {r.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
