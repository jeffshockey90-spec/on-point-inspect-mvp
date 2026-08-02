"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";

type Row = {
  label: string;
  email?: string;
  status: "would_change" | "changed" | "unchanged" | "error";
  fromCents?: number;
  toCents?: number;
  error?: string;
};

type Data = {
  ok: boolean;
  dryRun: boolean;
  totalActive: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: Row[];
};

function money(cents: any) {
  const d = (Number(cents) || 0) / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

export default function RepriceSubscribersPanel() {
  const [preview, setPreview] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [proration, setProration] = useState<"none" | "immediate">("none");
  const [done, setDone] = useState<Data | null>(null);

  async function run(dryRun: boolean) {
    const res = await fetch("/api/owner/subscriptions/reprice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun, proration }),
    });
    return (await res.json().catch(() => null)) as Data | null;
  }

  useEffect(() => {
    run(true)
      .then((d) => setPreview(d))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wouldChange = (preview?.results || []).filter((r) => r.status === "would_change");

  async function apply() {
    if (applying) return;
    if (!window.confirm(
      `Re-price ${wouldChange.length} active subscriber(s) to their current plan price?\n\n` +
      (proration === "immediate"
        ? "Proration ON: Stripe will credit/charge the difference now."
        : "Proration OFF: the new price starts at each subscriber's next renewal.")
    )) return;
    setApplying(true);
    try {
      const d = await run(false);
      setDone(d);
      const fresh = await run(true);
      setPreview(fresh);
    } finally {
      setApplying(false);
    }
  }

  if (loading || !preview) return null;

  return (
    <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0b1220] to-[#071827] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <RefreshCcw className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
              Subscriptions
            </p>
            <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Re-price Active Subscribers
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Move people already paying onto their current plan price. A price change
              alone only affects new subscribers.
            </p>
          </div>
        </div>

        <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-black text-slate-300">
          {preview.totalActive} active
        </span>
      </div>

      {preview.totalActive === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-700 bg-[#020617]/70 p-4 text-sm text-slate-300">
          No active subscribers yet — nothing to re-price.
        </div>
      ) : wouldChange.length === 0 ? (
        <div className="mt-5 rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          All {preview.totalActive} active subscribers are already on their current plan price. ✅
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
            <p className="text-sm font-black text-amber-200">
              {wouldChange.length} subscriber(s) are on an old price:
            </p>
            <div className="mt-3 max-h-52 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-slate-800">
                  {wouldChange.map((r, i) => (
                    <tr key={i} className="text-slate-300">
                      <td className="py-1.5 pr-3 font-semibold text-white">{r.label}</td>
                      <td className="py-1.5 pr-3 text-slate-400">{money(r.fromCents)}/mo</td>
                      <td className="py-1.5 text-emerald-300">→ {money(r.toCents)}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="radio" checked={proration === "none"} onChange={() => setProration("none")} className="accent-amber-400" />
              Apply at each subscriber&apos;s next renewal (recommended — no surprise charges)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="radio" checked={proration === "immediate"} onChange={() => setProration("immediate")} className="accent-amber-400" />
              Apply now with proration (Stripe credits/charges the difference immediately)
            </label>
          </div>

          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-center font-black text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {applying ? "Re-pricing…" : `Re-price ${wouldChange.length} subscriber(s) now`}
          </button>
        </>
      )}

      {done && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Done — {done.changed} re-priced, {done.unchanged} already current
          {done.failed ? `, ${done.failed} failed (check logs)` : ""}.
        </p>
      )}
    </section>
  );
}
