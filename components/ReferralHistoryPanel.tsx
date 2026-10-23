"use client";

import { useEffect, useState } from "react";

type Referral = {
  type: string;
  client: string | null;
  property: string | null;
  recipient: string | null;
  recipient_email: string | null;
  inspector: string;
  status: string | null;
  note: string | null;
  when: string | null;
  source_id: string;
};

function fmt(when: string | null) {
  if (!when) return "—";
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusTone(status: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "submitted") return "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]";
  if (s === "error" || s === "failed") return "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]";
  return "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]";
}

export default function ReferralHistoryPanel() {
  const [rows, setRows] = useState<Referral[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "security" | "insurance">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/owner/referral-history", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Could not load referral history.");
          setRows([]);
        } else {
          setRows(Array.isArray(data.referrals) ? data.referrals : []);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load referral history.");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = (rows || []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "insurance") return r.type.toLowerCase().includes("insurance");
    return !r.type.toLowerCase().includes("insurance");
  });

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--fl-text)]">Referral history</h3>
          <p className="mt-0.5 text-sm text-[var(--fl-muted)]">Every referral request your clients have sent — all services in one place.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-1 text-xs font-semibold">
          {(["all", "security", "insurance"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 capitalize [touch-action:manipulation] ${
                filter === f ? "bg-teal-500 text-slate-950" : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="mt-4 text-sm text-[var(--fl-faint)]">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-[var(--fl-crit-text)]">{error}</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--fl-muted)]">No referral requests yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {shown.map((r) => (
            <div key={`${r.type}-${r.source_id}`} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-raised)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--fl-text)]">
                  {r.type}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusTone(r.status)}`}>
                  {r.status || "—"}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--fl-text)]">{r.client || "Unknown client"}</p>
              {r.property && <p className="text-xs text-[var(--fl-muted)]">{r.property}</p>}
              <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-[var(--fl-muted)] sm:grid-cols-2">
                <p><span className="text-[var(--fl-faint)]">To:</span> {r.recipient || "—"}{r.recipient_email ? ` (${r.recipient_email})` : ""}</p>
                <p><span className="text-[var(--fl-faint)]">By:</span> {r.inspector}</p>
                <p className="sm:col-span-2"><span className="text-[var(--fl-faint)]">When:</span> {fmt(r.when)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
