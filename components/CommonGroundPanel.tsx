import type { CommonGround, PrevTier } from "../lib/dealInsights";

// The "Common Ground" panel shown under a finding on the client report:
// how common the defect is (national + local), how hard it is to fix, and a
// typical cost — plus a "stands out" flag for rare + serious items.
// Server-rendered (no interactivity).

const TIER: Record<
  PrevTier,
  { label: string; text: string; bar: string; chip: string }
> = {
  common: {
    label: "Common — routine for homes like this",
    text: "text-[var(--fl-good-text)]",
    bar: "bg-emerald-400",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
  },
  typical: {
    label: "Typical — seen regularly",
    text: "text-[var(--fl-info-text)]",
    bar: "bg-sky-400",
    chip: "border-sky-500/40 bg-sky-500/10 text-[var(--fl-info-text)]",
  },
  uncommon: {
    label: "Uncommon — worth budgeting for",
    text: "text-[var(--fl-warn-text)]",
    bar: "bg-amber-400",
    chip: "border-amber-500/40 bg-amber-500/10 text-[var(--fl-warn-text)]",
  },
  rare: {
    label: "Rare — seldom seen today",
    text: "text-[var(--fl-crit-text)]",
    bar: "bg-rose-400",
    chip: "border-rose-500/40 bg-rose-500/10 text-[var(--fl-crit-text)]",
  },
};

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

function stateName(code: string) {
  return code; // 2-letter code reads fine ("In MD"); could map to full name later
}

export default function CommonGroundPanel({
  data,
  showCosts = false,
}: {
  data: CommonGround;
  showCosts?: boolean;
}) {
  const t = TIER[data.tier];
  const natPct = Math.round((data.national?.pct || 0) * 100);
  const locPct = data.local ? Math.round(data.local.pct * 100) : null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--fl-accent-text)]">
          <span className="inline-block h-4 w-4 rounded-[5px] bg-gradient-to-br from-teal-400 to-teal-600" />
          Common Ground
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fl-faint)]">
          AI Market Insight
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {/* How common */}
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fl-faint)]">
            How common is this?
          </p>

          <div className="mb-2 flex items-center gap-2.5">
            <span className="w-[74px] text-xs font-semibold text-[var(--fl-muted)]">Nationwide</span>
            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--fl-surface-2)]">
              <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(3, natPct)}%` }} />
            </span>
            <span className={`w-[46px] text-right text-[13px] font-semibold tabular-nums ${t.text}`}>{natPct}%</span>
          </div>

          {locPct != null && data.local && (
            <div className="mb-2 flex items-center gap-2.5">
              <span className="w-[74px] text-xs font-semibold text-[var(--fl-muted)]">In {stateName(data.local.state)}</span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--fl-surface-2)]">
                <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(3, locPct)}%` }} />
              </span>
              <span className={`w-[46px] text-right text-[13px] font-semibold tabular-nums ${t.text}`}>{locPct}%</span>
            </div>
          )}

          <span className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${t.chip}`}>
            {t.label}
          </span>
        </div>

        {/* Ease of repair (+ optional cost) */}
        <div className="md:border-l md:border-[var(--fl-raised)] md:pl-4">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fl-faint)]">
            Ease of repair
          </p>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--fl-text)]">
            <span className={`h-[7px] w-[7px] rounded-full ${t.bar}`} />
            {data.ease.label}
          </span>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--fl-muted)]">{data.repairNote}</p>
          {showCosts && (
            <div className="mt-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fl-faint)]">
                {data.cost.region ? `Typical cost in ${data.cost.region}` : "Typical cost"}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--fl-accent-text)]">
                {money(data.cost.low)}–{money(data.cost.high)}
              </p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--fl-faint)]">
                {data.cost.region
                  ? "Approximate range for your area — get a contractor quote for exact pricing."
                  : "Approximate range — get a contractor quote for exact pricing."}
              </p>
            </div>
          )}
        </div>
      </div>

      {data.standsOut && (
        <div className="-mx-4 -mb-4 mt-3 flex items-center gap-2.5 rounded-b-xl border-t border-rose-500/40 bg-gradient-to-r from-rose-500/10 to-transparent px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-400 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-950">
            ⚑ Stands out
          </span>
          <p className="text-[13.5px] text-[var(--fl-text)]">
            <b>Rare and a genuine concern</b> — worth pricing into the conversation.
          </p>
        </div>
      )}
    </div>
  );
}
