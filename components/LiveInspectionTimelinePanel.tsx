"use client";


import { formatAppValue } from "../lib/app-time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INSPECTION_DATA_CHANGED_EVENT, matchesInspectionEvent } from "../lib/inspectionEvents";

type TimelineEventTone = "info" | "success" | "warning" | "critical" | "ai";

type InspectionTimelineEvent = {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  system?: string;
  tone: TimelineEventTone;
  source: "inspection" | "finding" | "equipment" | "photo" | "view" | "ai";
};

type TimelineResult = {
  events: InspectionTimelineEvent[];
  highlights: string[];
  nextActions: string[];
  findingCount: number;
  equipmentCount: number;
  photoCount: number;
};

function toneClass(tone: TimelineEventTone) {
  if (tone === "critical") return "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]";
  if (tone === "warning") return "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  if (tone === "success") return "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]";
  if (tone === "ai") return "border-purple-500/50 bg-purple-500/10 text-[var(--fl-purple-text)]";
  return "border-cyan-500/40 bg-cyan-500/10 text-[var(--fl-info-text)]";
}

function sourceIcon(source: InspectionTimelineEvent["source"]) {
  if (source === "finding") return "📝";
  if (source === "equipment") return "🏷️";
  if (source === "photo") return "📷";
  if (source === "view") return "👁️";
  if (source === "ai") return "🧠";
  return "🏠";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return formatAppValue(date, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--fl-text)]">{value}</p>
    </div>
  );
}

export default function LiveInspectionTimelinePanel({ inspectionId }: { inspectionId: string }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const inFlight = useRef(false);
  const isIntersecting = useRef(false);
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(document.visibilityState === "visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting.current = entry.isIntersecting;
        setActive(entry.isIntersecting && document.visibilityState === "visible");
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );
    const onVisibilityChange = () => {
      setActive(isIntersecting.current && document.visibilityState === "visible");
    };

    observer.observe(node);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const loadTimeline = useCallback(async () => {
    if (!inspectionId || !active || inFlight.current) return;

    inFlight.current = true;
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai/inspection-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId, inspection_id: inspectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Inspection timeline failed.");
        return;
      }
      setResult(data);
    } catch (error: any) {
      setMessage(error?.message || "Inspection timeline failed.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId, active]);

  useEffect(() => {
    if (!active) return;
    loadTimeline();
    const interval = window.setInterval(loadTimeline, 15000);

    const handleChanged = (event: Event) => {
      if (!matchesInspectionEvent(event, inspectionId)) return;
      window.setTimeout(() => void loadTimeline(), 350);
    };

    window.addEventListener(INSPECTION_DATA_CHANGED_EVENT, handleChanged);
    window.addEventListener("opi:findings-changed", handleChanged);
    window.addEventListener("opi:equipment-changed", handleChanged);
    window.addEventListener("opi:reference-photos-changed", handleChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(INSPECTION_DATA_CHANGED_EVENT, handleChanged);
      window.removeEventListener("opi:findings-changed", handleChanged);
      window.removeEventListener("opi:equipment-changed", handleChanged);
      window.removeEventListener("opi:reference-photos-changed", handleChanged);
    };
  }, [active, inspectionId, loadTimeline]);

  const events = useMemo(() => result?.events || [], [result]);

  return (
    <section ref={rootRef} className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 shadow-xl" style={{ contentVisibility: "auto", containIntrinsicSize: "700px" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-info-text)]">Live Inspection Timeline</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">AI Activity Timeline</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">Tracks findings, equipment, media, report activity, and AI follow-up reminders as the inspection develops.</p>
        </div>
        <button type="button" onClick={loadTimeline} disabled={loading || !inspectionId || !active} className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? "Updating..." : "Refresh Timeline"}
        </button>
      </div>

      {message && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">{message}</div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SmallStat label="Findings" value={result?.findingCount ?? "—"} />
        <SmallStat label="Equipment" value={result?.equipmentCount ?? "—"} />
        <SmallStat label="Media" value={result?.photoCount ?? "—"} />
      </div>

      {result?.highlights?.length ? (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Timeline Highlights</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.highlights.map((item, index) => <span key={index} className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-[var(--fl-info-text)]">{item}</span>)}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Recent Timeline</h3>
            <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--fl-muted)]">{events.length}</span>
          </div>
          {events.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">Timeline will populate as findings, photos, equipment, and report activity are saved.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {events.slice(0, 12).map((item) => (
                <div key={item.id} className={`rounded-xl border p-3 ${toneClass(item.tone)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{sourceIcon(item.source)} {item.title}</p>
                      <p className="mt-1 text-xs leading-5 opacity-90">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold opacity-90">{formatTime(item.timestamp)}</p>
                      {item.system && <p className="mt-1 rounded-full border border-current/30 px-2 py-1 text-[10px] font-semibold opacity-90">{item.system}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">AI Next Actions</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--fl-muted)]">
            {(result?.nextActions || ["Continue inspecting and saving findings. AI will surface follow-up items as data is added."]).map((item, index) => <li key={index}>✓ {item}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
