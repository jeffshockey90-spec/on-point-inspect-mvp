// Report-level Common Ground summary — the "routine vs. stands out" split,
// computed from the per-finding panels. Server-rendered.

export type CommonGroundSummaryData = {
  total: number;
  standsOut: number;
  routine: number;
  uncommon: number;
};

export default function CommonGroundSummary({ data }: { data: CommonGroundSummaryData }) {
  if (!data || data.total < 3) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block h-4 w-4 rounded-[5px] bg-gradient-to-br from-teal-400 to-teal-600" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--fl-accent-text)]">
          Common Ground · at a glance
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-transparent p-4">
          <div className="text-3xl font-semibold leading-none text-emerald-300 tabular-nums">
            {data.routine}
          </div>
          <h4 className="mt-2 text-[15px] font-semibold text-[var(--fl-text)]">Mostly routine</h4>
          <p className="mt-1 text-[13px] leading-5 text-[var(--fl-muted)]">
            Common in homes of this age and area — real, but the kind most inspections turn up. They
            rarely change a deal.
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            data.standsOut > 0
              ? "border-rose-500/40 bg-gradient-to-b from-rose-500/10 to-transparent"
              : "border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
          }`}
        >
          <div
            className={`text-3xl font-semibold leading-none tabular-nums ${
              data.standsOut > 0 ? "text-rose-300" : "text-[var(--fl-muted)]"
            }`}
          >
            {data.standsOut}
          </div>
          <h4 className="mt-2 text-[15px] font-semibold text-[var(--fl-text)]">Genuinely stands out</h4>
          <p className="mt-1 text-[13px] leading-5 text-[var(--fl-muted)]">
            {data.standsOut > 0
              ? "Both rare and serious — this is what a buyer and agent should focus on. Flagged automatically."
              : "Nothing rare and serious turned up on this home — a reassuring sign."}
          </p>
        </div>
      </div>
      {data.uncommon > 0 && (
        <p className="mt-3 text-[13px] text-amber-300/90">
          {data.uncommon} finding{data.uncommon === 1 ? "" : "s"} {data.uncommon === 1 ? "is" : "are"} uncommon — often a bigger‑ticket or aging‑system item worth budgeting for.
        </p>
      )}
    </div>
  );
}
