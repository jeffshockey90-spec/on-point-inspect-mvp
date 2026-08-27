"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

type Event = {
  id: number;
  created_at: string;
  event_type: string;
  ip: string | null;
  path: string | null;
  detail: any;
};

type Data = {
  available: boolean;
  events: Event[];
  alerts: { id: number; created_at: string; ip: string | null }[];
  summary: { total24h: number; total7d: number; distinctIps: number; alerts7d: number };
};

const TYPE_LABEL: Record<string, string> = {
  portal_enum: "Portal id guessing",
  repair_enum: "Repair-request probing",
  env_enum: "Lab-results probing",
  checkout_enum: "Payment id guessing",
  signup_hijack: "Signup hijack attempt",
};

function label(type: string) {
  return TYPE_LABEL[type] || type;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SecurityEventsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/owner/security-events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  const quiet = data.available && data.summary.total7d === 0;

  return (
    <section className="rounded-2xl border border-[#1a212c] bg-gradient-to-br from-[#10151e] to-[#10151e] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <ShieldAlert className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">
              Security
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              Intrusion Attempts
            </h2>
            <p className="mt-1 text-sm text-[#8a93a3]">
              Blocked attempts to reach data by guessing ids. You&apos;re alerted on bursts.
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            quiet
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {quiet ? "All clear" : `${data.summary.total24h} in 24h`}
        </span>
      </div>

      {!data.available ? (
        <div className="mt-5 rounded-xl border border-[#232b38] bg-[#131923] p-4 text-sm leading-6 text-[#8a93a3]">
          Logging table not found yet. Run{" "}
          <span className="font-mono text-xs text-[#8a93a3]">
            supabase/add-security-events.sql
          </span>{" "}
          to start recording attempts.
        </div>
      ) : quiet ? (
        <div className="mt-5 rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          No blocked intrusion attempts in the last 7 days. 🛡️
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Last 24h", v: data.summary.total24h },
              { k: "Last 7 days", v: data.summary.total7d },
              { k: "Distinct IPs", v: data.summary.distinctIps },
              { k: "Alerts sent", v: data.summary.alerts7d },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-xl border border-[#232b38] bg-[#131923] p-3 text-center"
              >
                <p className="text-2xl font-semibold text-rose-300">{s.v}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#59626f]">
                  {s.k}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#232b38]">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#0a0e13] text-[11px] uppercase tracking-wide text-[#59626f]">
                  <tr>
                    <th className="px-3 py-2 font-bold">When</th>
                    <th className="px-3 py-2 font-bold">Attempt</th>
                    <th className="px-3 py-2 font-bold">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a212c]">
                  {data.events.map((e) => (
                    <tr key={e.id} className="text-[#8a93a3]">
                      <td className="whitespace-nowrap px-3 py-2 text-[#8a93a3]">
                        {timeAgo(e.created_at)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-white">{label(e.event_type)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#8a93a3]">
                        {e.ip || "unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#59626f]">
            All of these were blocked — no data was exposed. Showing the most recent {data.events.length}.
          </p>
        </>
      )}
    </section>
  );
}
