// Builder header strip: Agreement · Payment · Report · Sent chips (each links
// to where it's fixed — tab panels open via ReportBuilderSectionTabs' hash
// handling) and the one "Next" step. Data from lib/report/jobStatus.

import type { NextStep, StatusChip, StatusTone } from "../lib/report/jobStatus";

const TONE: Record<StatusTone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
  warn: "border-amber-500/40 bg-amber-500/10 text-[var(--fl-warn-text)]",
  bad: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  muted: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]",
};

export default function JobStatusStrip({ chips, next }: { chips: StatusChip[]; next: NextStep }) {
  return (
    <div className="mt-3 w-full">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chips.map((chip) => (
          <a
            key={chip.key}
            href={chip.href}
            className={`rounded-xl border px-3 py-2 text-center transition active:scale-[0.98] [touch-action:manipulation] ${TONE[chip.tone]}`}
          >
            <span className="block text-xs font-bold">{chip.label}</span>
            <span className="block text-[11px] opacity-90">{chip.value}</span>
          </a>
        ))}
      </div>
      {next && (
        <a
          href={next.href}
          className={`mt-2 block rounded-xl border px-3 py-2.5 transition active:scale-[0.99] [touch-action:manipulation] ${TONE[next.tone]}`}
        >
          <span className="block text-sm font-semibold text-[var(--fl-text)]">{next.title}</span>
          <span className="block text-xs">{next.detail}</span>
        </a>
      )}
    </div>
  );
}
