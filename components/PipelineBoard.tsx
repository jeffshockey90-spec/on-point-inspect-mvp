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

  const visibleJobs = useMemo(() => {
    const list = selected
      ? jobs.filter((j) => j.stage === selected)
      : jobs.filter((j) => j.stage !== "delivered");
    return list.slice(0, 12);
  }, [jobs, selected]);

  const selectedMeta = selected ? STAGE_META[selected] : null;

  return (
    <section className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
            Pipeline
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            Every job, at a glance
          </h2>
        </div>
        <Link
          href="/reports"
          className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
        >
          All Reports
        </Link>
      </div>

      {/* Clickable stage chips — the funnel, but every card filters the list. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((stage, index) => {
          const meta = STAGE_META[stage.key] || STAGE_META.report;
          const isSelected = selected === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(isSelected ? null : stage.key)}
              className={`relative rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? meta.ring
                  : "border-[var(--fl-raised)] bg-[var(--fl-surface-2)] hover:border-[var(--fl-line)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                <span className="font-mono text-[26px] font-semibold tabular-nums text-[var(--fl-text)]">
                  {stage.count}
                </span>
              </div>
              <p className={`mt-3 text-sm font-semibold ${meta.color}`}>{stage.label}</p>
              <p className="mt-0.5 text-xs text-[var(--fl-muted)]">{stage.hint}</p>
              {index < stages.length - 1 ? (
                <span className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 text-xl text-[var(--fl-faint)] lg:block">
                  ›
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Filter status row — what the list below is showing + a reset. */}
      <div className="mt-5 mb-3 flex flex-wrap items-center gap-2 text-sm">
        {selected ? (
          <>
            <span className="text-[var(--fl-muted)]">Showing</span>
            <StagePill stage={selected} />
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-1 rounded-lg border border-[var(--fl-line)] px-2.5 py-1 text-xs font-semibold text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-accent)]/50 hover:text-[var(--fl-accent-text)]"
            >
              Clear · show all active
            </button>
          </>
        ) : (
          <span className="text-[var(--fl-muted)]">
            <span className="font-semibold text-[var(--fl-text)]">{activeCount}</span> active{" "}
            {activeCount === 1 ? "job" : "jobs"} in progress — tap a stage above to filter
          </span>
        )}
      </div>

      {/* The filtered job list. */}
      {visibleJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-sm text-[var(--fl-muted)]">
          {selected
            ? `Nothing in ${selectedMeta?.label || "this stage"} right now.`
            : "No active jobs — everything is delivered. Nice work."}
        </div>
      ) : (
        <div className="overflow-x-auto">
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
        </div>
      )}
    </section>
  );
}
