"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

type ByInspector = { inspector_id: string; email: string; count: number; lastAt: string | null };
type Recent = { inspection_id: number; client_name: string; inspector_email: string; at: string | null };
type Data = {
  total: number;
  thisMonth: number;
  errors: number;
  byInspector: ByInspector[];
  recent: Recent[];
};

function shortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Secure24LeadsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/owner/secure24-leads", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--fl-surface)] p-6 shadow-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[var(--fl-accent-text)]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fl-accent-text)]">Partner</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">Secure 24 Referral Leads</h2>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Home-security leads clients opted into, by inspector — for monthly payout reconciliation.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[var(--fl-muted)]">Loading…</p>
      ) : !data ? (
        <p className="mt-6 text-sm text-[var(--fl-muted)]">Couldn't load referral leads.</p>
      ) : data.total === 0 && data.errors === 0 ? (
        <p className="mt-6 rounded-2xl border border-white/10 bg-[var(--fl-surface-2)] p-4 text-sm text-[var(--fl-muted)]">
          No referral leads yet. Once an inspector turns the referral on and a client opts in, leads
          will show up here.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="text-3xl font-semibold text-[var(--fl-accent-text)]">{data.total}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">Total leads sent</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[var(--fl-surface-2)] p-4">
              <p className="text-3xl font-semibold text-[var(--fl-text)]">{data.thisMonth}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">This month</p>
            </div>
            <div className={`rounded-2xl border p-4 ${data.errors > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-[var(--fl-surface-2)]"}`}>
              <p className={`text-3xl font-semibold ${data.errors > 0 ? "text-[var(--fl-warn-text)]" : "text-[var(--fl-faint)]"}`}>{data.errors}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Failed sends</p>
            </div>
          </div>

          {data.byInspector.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                    <th className="py-2 pr-3">Inspector</th>
                    <th className="px-3 py-2 text-right">Leads</th>
                    <th className="px-3 py-2 text-right">Last lead</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byInspector.map((i) => (
                    <tr key={i.inspector_id} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-bold text-[var(--fl-text)]">{i.email}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[var(--fl-accent-text)]">{i.count}</td>
                      <td className="px-3 py-2 text-right text-[var(--fl-muted)]">{shortDate(i.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.recent.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Recent leads</p>
              <div className="mt-2 space-y-2">
                {data.recent.map((r, idx) => (
                  <div
                    key={`${r.inspection_id}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-[var(--fl-surface-2)] px-3 py-2 text-sm"
                  >
                    <span className="font-bold text-[var(--fl-text)]">{r.client_name}</span>
                    <span className="text-[var(--fl-faint)]">{r.inspector_email}</span>
                    <span className="text-[var(--fl-faint)]">{shortDate(r.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
