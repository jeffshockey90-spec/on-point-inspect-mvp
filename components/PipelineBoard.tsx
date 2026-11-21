"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// One interactive surface that merges the pipeline funnel + the active-jobs
// table: click a stage to filter the job list below it. No selection = every
// active (non-delivered) job, which is the old "Active Jobs" default. This
// replaces the two separate, redundant widgets with a single mental model.

export type PipelineStage = {
  key: string;
  label: string;
  hint: string;
  count: number;
};

export type PipelineJob = {
  id: string;
  address: string;
  client: string;
  stage: string;
  paid: boolean;
  paymentLabel: string;
  dateLabel: string;
};

const STAGE_META: Record<
  string,
  { label: string; color: string; chip: string; dot: string; ring: string }
> = {
  scheduled: { label: "Scheduled", color: "text-[var(--fl-info-text)]", chip: "border-sky-500/40 bg-sky-500/10", dot: "bg-sky-400", ring: "border-sky-400 bg-sky-500/10" },
  report: { label: "In Report", color: "text-[var(--fl-purple-text)]", chip: "border-violet-500/40 bg-violet-500/10", dot: "bg-violet-400", ring: "border-violet-400 bg-violet-500/10" },
  agreement: { label: "Agreement", color: "text-[var(--fl-warn-text)]", chip: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400", ring: "border-amber-400 bg-amber-500/10" },
  payment: { label: "Payment", color: "text-[var(--fl-warn-text)]", chip: "border-orange-500/40 bg-orange-500/10", dot: "bg-orange-400", ring: "border-orange-400 bg-orange-500/10" },
  delivered: { label: "Delivered", color: "text-[var(--fl-good-text)]", chip: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400", ring: "border-emerald-400 bg-emerald-500/10" },
};

function StagePill({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] || STAGE_META.report;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.chip} ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export default function PipelineBoard({
  stages,
  jobs,
}: {
  stages: PipelineStage[];
  jobs: PipelineJob[];
}) {
  // null = the default view: every active (non-delivered) job.
  const [selected, setSelected] = useState<string | null>(null);

  const activeCount = useMemo(
    () => jobs.filter((j) => j.stage !== "delivered").length,
    [jobs],
  );

  // Show the first few jobs; "Show all" expands the list.
  const [showAll, setShowAll] = useState(false);

  const filteredJobs = useMemo(
    () =>
      selected
        ? jobs.filter((j) => j.stage === selected)
        : jobs.filter((j) => j.stage !== "delivered"),
    [jobs, selected],
  );
  const visibleJobs = showAll ? filteredJobs : filteredJobs.slice(0, 6);
  // Phones show fewer before "Show all" so the page stays short.
  const phoneJobs = showAll ? filteredJobs : filteredJobs.slice(0, 3);
  const hiddenOnPhone = filteredJobs.length - phoneJobs.length;
  const hiddenOnWide = filteredJobs.length - visibleJobs.length;

  function pick(key: string | null) {
    setSelected(key);
    setShowAll(false);
  }

  const selectedMeta = selected ? STAGE_META[selected] : null;

  return (
    <section className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.3)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
          Pipeline
        </p>
        <Link
          href="/reports"
          className="text-sm font-semibold text-[var(--fl-accent-text)] hover:opacity-80"
        >
          All reports
        </Link>
      </div>

      {/* Stage chips: tap one to filter the list below; "Active" shows every
          job still in progress. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={selected === null}
          onClick={() => pick(null)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
            selected === null
              ? "border-[var(--fl-accent)] text-[var(--fl-accent-text)]"
              : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)] hover:border-[var(--fl-accent)]/50"
          }`}
        >
          Active <span className="font-mono tabular-nums">{activeCount}</span>
        </button>
        {stages.map((stage) => {
          const meta = STAGE_META[stage.key] || STAGE_META.report;
          const isSelected = selected === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={isSelected}
              title={stage.hint}
              onClick={() => pick(isSelected ? null : stage.key)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                isSelected
                  ? `${meta.ring} ${meta.color}`
                  : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)] hover:border-[var(--fl-accent)]/50"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {stage.label}
              <span className="font-mono tabular-nums">{stage.count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3" />

      {/* The filtered job list. */}
      {visibleJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-sm text-[var(--fl-muted)]">
          {selected
            ? `Nothing in ${selectedMeta?.label || "this stage"} right now.`
            : "No active jobs — everything is delivered. Nice work."}
        </div>
      ) : (
        <>
        {/* Phones and small tablets: compact rows; tap a row to open the report. */}
        <div className="md:hidden">
          {phoneJobs.map((job) => (
            <Link
              key={job.id}
              href={`/reports/${job.id}`}
              className="flex items-center justify-between gap-3 border-t border-[var(--fl-line)] py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold text-[var(--fl-text)]">{job.address}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--fl-muted)]">
                  {[job.client, job.dateLabel].filter(Boolean).join(" · ")}
                  {" · "}
                  <span className={job.paid ? "text-[var(--fl-good-text)]" : "text-[var(--fl-warn-text)]"}>
                    {job.paymentLabel}
                  </span>
                </p>
              </div>
              <div className="shrink-0">
                <StagePill stage={job.stage} />
              </div>
            </Link>
          ))}
          {hiddenOnPhone > 0 || showAll ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1 flex min-h-11 w-full items-center justify-center border-t border-[var(--fl-line)] pt-2 text-sm font-semibold text-[var(--fl-accent-text)]"
            >
              {showAll ? "Show fewer" : `Show all ${filteredJobs.length} jobs`}
            </button>
          ) : null}
        </div>

        {/* md and up: the full table. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--fl-raised)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fl-faint)]">
                <th className="px-3 py-2.5">Property / Client</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Payment</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-[var(--fl-raised)] transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[var(--fl-text)]">{job.address}</p>
                    <p className="text-xs text-[var(--fl-muted)]">
                      {job.client || "No client listed"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <StagePill stage={job.stage} />
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        job.paid
                          ? "text-xs font-semibold text-[var(--fl-good-text)]"
                          : "text-xs font-semibold text-[var(--fl-warn-text)]"
                      }
                    >
                      {job.paymentLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-sm tabular-nums text-[var(--fl-muted)]">
                    {job.dateLabel}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/reports/${job.id}`}
                      className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent)] transition-colors hover:border-[var(--fl-accent)]/50 hover:bg-[var(--fl-accent)]/10"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenOnWide > 0 || (showAll && filteredJobs.length > 6) ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:opacity-80"
            >
              {showAll ? "Show fewer" : `Show all ${filteredJobs.length} jobs`}
            </button>
          ) : null}
        </div>
        </>
      )}
    </section>
  );
}
