"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Send, FileCheck2, DollarSign } from "lucide-react";

type Inspector = {
  inspector_id: string;
  email: string;
  isOwner: boolean;
  inspections: number;
  scheduled: number;
  published: number;
  sent: number;
  paid: number;
  lastScheduled: string | null;
  lastPublished: string | null;
  lastSent: string | null;
  lastPaid: string | null;
};

function shortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), stale: days >= 30 };
}

// A table cell showing a count with the date it last happened underneath.
function CountDate({ count, iso, accent }: { count: number; iso: string | null; accent?: boolean }) {
  const d = count > 0 ? shortDate(iso) : null;
  return (
    <td className="px-3 py-2 text-right align-top">
      <div className={`font-bold ${accent && count > 0 ? "text-teal-300" : count > 0 ? "text-[#e8ecf3]" : "text-[#59626f]"}`}>
        {count}
      </div>
      <div
        className={`text-[10px] font-bold ${
          count === 0 ? "text-[#59626f]" : d?.stale ? "text-amber-300" : "text-[#59626f]"
        }`}
      >
        {count === 0 ? "—" : d ? d.label : "—"}
      </div>
    </td>
  );
}

type Data = {
  funnel: { inspectors: number; scheduled: number; published: number; sent: number; paid: number };
  inspectors: Inspector[];
};

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export default function InspectorActivityPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/owner/inspector-activity", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const total = data?.funnel.inspectors || 0;

  const steps = [
    { key: "scheduled", label: "Schedule", icon: CalendarCheck, value: data?.funnel.scheduled || 0 },
    { key: "published", label: "Publish", icon: FileCheck2, value: data?.funnel.published || 0 },
    { key: "sent", label: "Send report", icon: Send, value: data?.funnel.sent || 0 },
    { key: "paid", label: "Collect payment", icon: DollarSign, value: data?.funnel.paid || 0 },
  ] as const;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#10151e] p-6 shadow-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">Activation</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Inspector Activity</h2>
          <p className="mt-1 text-sm text-[#8a93a3]">
            Of your active inspectors, how many actually schedule, publish, send, and get paid.
          </p>
        </div>
        {!loading && (
          <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-center">
            <p className="text-3xl font-semibold leading-none text-teal-200">{total}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-teal-300/80">Active inspectors</p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#8a93a3]">Loading…</p>
      ) : !data ? (
        <p className="mt-6 text-sm text-[#8a93a3]">Couldn't load inspector activity.</p>
      ) : (
        <>
          {/* Activation funnel */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center gap-2 text-teal-300">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">{s.label}</span>
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {s.value}
                    <span className="text-base font-bold text-[#59626f]">/{total}</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${pct(s.value, total)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-[#8a93a3]">
                    {pct(s.value, total)}% of inspectors
                  </p>
                </div>
              );
            })}
          </div>

          {/* Per-inspector breakdown */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide text-[#59626f]">
                  <th className="py-2 pr-3">Inspector</th>
                  <th className="px-3 py-2 text-right">Inspections</th>
                  <th className="px-3 py-2 text-right">Scheduled<br /><span className="text-[9px] font-bold normal-case text-[#59626f]">count · last</span></th>
                  <th className="px-3 py-2 text-right">Published<br /><span className="text-[9px] font-bold normal-case text-[#59626f]">count · last</span></th>
                  <th className="px-3 py-2 text-right">Sent<br /><span className="text-[9px] font-bold normal-case text-[#59626f]">count · last</span></th>
                  <th className="px-3 py-2 text-right">Paid<br /><span className="text-[9px] font-bold normal-case text-[#59626f]">count · last</span></th>
                </tr>
              </thead>
              <tbody>
                {data.inspectors.map((i) => (
                  <tr key={i.inspector_id} className="border-b border-white/5">
                    <td className="py-2 pr-3 align-top">
                      <span className="font-bold text-white">{i.email}</span>
                      {i.isOwner && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top font-bold text-[#e8ecf3]">{i.inspections}</td>
                    <CountDate count={i.scheduled} iso={i.lastScheduled} />
                    <CountDate count={i.published} iso={i.lastPublished} />
                    <CountDate count={i.sent} iso={i.lastSent} />
                    <CountDate count={i.paid} iso={i.lastPaid} accent />
                  </tr>
                ))}
                {data.inspectors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-[#8a93a3]">
                      No inspector activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
