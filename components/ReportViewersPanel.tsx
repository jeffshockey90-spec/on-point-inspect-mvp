"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAppValue } from "../lib/app-time";
import { ACCESS_METHOD_LABEL, type AccessMethod, type ViewerReport } from "../lib/reportViewers";

// "Who Viewed This Report" — exactly who opened the report and how they got in.
// Reads /api/reports/[id]/viewers (built from inspection_view_events). Works for
// demo/sample reports too. Auto-refreshes on a light interval + when the tab
// becomes visible, and only fetches while it's actually on screen.

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatAppValue(new Date(iso), { month: "short", day: "numeric" });
}

function exactTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function readingTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s <= 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

const METHOD_STYLE: Record<AccessMethod, string> = {
  client_portal: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
  shared_link: "border-sky-500/40 bg-sky-500/10 text-[var(--fl-info-text)]",
  email_link: "border-indigo-500/40 bg-indigo-500/10 text-[var(--fl-info-text)]",
  text_link: "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
  qr_code: "border-purple-500/40 bg-purple-500/10 text-[var(--fl-purple-text)]",
  environmental: "border-cyan-500/40 bg-cyan-500/10 text-[var(--fl-info-text)]",
  direct: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]",
};

function MethodChip({ method }: { method: AccessMethod }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${METHOD_STYLE[method]}`}
    >
      {ACCESS_METHOD_LABEL[method]}
    </span>
  );
}

function roleTone(role: string | null): string {
  const r = String(role || "").toLowerCase();
  if (r === "client" || r === "co-buyer") return "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]";
  if (r === "realtor") return "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  return "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]";
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--fl-text)]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--fl-faint)]">{sub}</p>}
    </div>
  );
}

export default function ReportViewersPanel({ inspectionId }: { inspectionId: string | number }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const isIntersecting = useRef(false);
  const inFlight = useRef(false);
  const [active, setActive] = useState(false);
  const [data, setData] = useState<ViewerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting.current = entry.isIntersecting;
        setActive(entry.isIntersecting && document.visibilityState === "visible");
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );
    const onVis = () => setActive(isIntersecting.current && document.visibilityState === "visible");
    observer.observe(node);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const load = useCallback(async () => {
    if (!inspectionId || !active || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${inspectionId}/viewers`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not load viewers.");
      setData(json as ViewerReport);
    } catch (err: any) {
      setError(err?.message || "Could not load viewers.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId, active]);

  useEffect(() => {
    if (!active) return;
    load();
    const interval = window.setInterval(load, 20000);
    return () => window.clearInterval(interval);
  }, [active, load]);

  const summary = data?.summary;
  const viewers = useMemo(() => data?.viewers || [], [data]);

  function toggle(key: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section
      ref={rootRef}
      className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4 shadow-xl"
      style={{ contentVisibility: "auto", containIntrinsicSize: "700px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-accent-text)]">
            Report Access
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">Who Viewed This Report</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
            Exactly who opened the report, how they got in, and how engaged they were.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || !active}
          className="rounded-xl border border-[var(--fl-line)] px-4 py-2.5 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
          {error}
        </div>
      )}

      {/* Summary line: has the client opened it? the realtor? */}
      {summary && (
        <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          <StatTile
            label="Client opened"
            value={summary.clientOpened.opened ? "Yes" : "Not yet"}
            sub={summary.clientOpened.at ? relativeTime(summary.clientOpened.at) : "no client open logged"}
          />
          <StatTile
            label="Realtor opened"
            value={summary.realtorOpened.opened ? "Yes" : "Not yet"}
            sub={summary.realtorOpened.at ? relativeTime(summary.realtorOpened.at) : "no realtor open logged"}
          />
          <StatTile label="Unique viewers" value={String(summary.totalViewers)} sub={`${summary.identifiedViewers} identified`} />
          <StatTile label="Total sessions" value={String(summary.totalSessions)} />
          <StatTile label="Reading time" value={readingTime(summary.totalSeconds)} />
        </div>
      )}

      {summary?.realtorBeforeClient && (
        <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-warn-text)]">
          ⚠️ The realtor opened this report before the client did.
        </div>
      )}

      <div className="mt-5 space-y-3">
        {viewers.length === 0 && !loading ? (
          <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
            No one has opened this report yet. Once it's sent, every open shows here — who they are, how
            they accessed it, and how long they read.
          </p>
        ) : (
          viewers.map((viewer) => {
            const open = expanded.has(viewer.key);
            return (
              <div key={viewer.key} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-[var(--fl-text)]">{viewer.name}</p>
                      {viewer.role && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${roleTone(viewer.role)}`}>
                          {viewer.role}
                        </span>
                      )}
                      {!viewer.identified && (
                        <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-raised)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--fl-faint)]">
                          Unidentified
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {viewer.methods.map((m) => (
                        <MethodChip key={m} method={m} />
                      ))}
                      {viewer.device && (
                        <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-text)]">
                          📱 {viewer.device}
                        </span>
                      )}
                      {viewer.flags.map((flag) => (
                        <span
                          key={flag}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            flag.startsWith("Highly")
                              ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]"
                              : "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]"
                          }`}
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--fl-text)]">{relativeTime(viewer.lastViewed)}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--fl-faint)]">
                      {viewer.sessions} {viewer.sessions === 1 ? "session" : "sessions"} · {readingTime(viewer.totalSeconds)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(viewer.key)}
                  className="mt-3 text-xs font-semibold text-[var(--fl-accent-text)] hover:underline"
                >
                  {open ? "Hide access log" : `Show access log (${viewer.sessionLog.length})`}
                </button>

                {open && (
                  <div className="mt-3 space-y-2 border-t border-[var(--fl-line)] pt-3">
                    {viewer.sessionLog.map((s, i) => (
                      <div key={`${viewer.key}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <MethodChip method={s.method} />
                          {s.device && <span className="text-[var(--fl-muted)]">📱 {s.device}</span>}
                        </div>
                        <span className="font-semibold text-[var(--fl-muted)]">{exactTime(s.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-[var(--fl-faint)]">
        Views are counted as sessions (a re-open after 30+ minutes is a new session). People we can identify
        are shown by name; everyone else is a stable “Unidentified visitor” — never a raw IP address.
      </p>
    </section>
  );
}
