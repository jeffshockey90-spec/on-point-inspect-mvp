"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INSPECTION_DATA_CHANGED_EVENT, matchesInspectionEvent } from "../lib/inspectionEvents";

type CompletenessIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  reason: string;
  recommendation: string;
  section?: string;
};

type SectionReview = {
  section: string;
  score: number;
  completedItems: string[];
  missingItems: string[];
  issues: CompletenessIssue[];
  canComplete: boolean;
  summary: string;
};

type CompletenessResult = {
  score: number;
  completedSystems: string[];
  missingSystems: string[];
  issues: CompletenessIssue[];
  sectionReviews: SectionReview[];
  currentSection?: SectionReview | null;
  generatedAt?: string;
};

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
  if (score >= 70) return "border-yellow-400/50 bg-yellow-500/10 text-yellow-100";
  return "border-red-400/50 bg-red-500/10 text-red-100";
}

function issueTone(severity: CompletenessIssue["severity"]) {
  if (severity === "critical") return "border-red-500/50 bg-red-500/10 text-red-100";
  if (severity === "warning") return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function LiveInspectionScore({
  inspectionId,
  section,
  online,
  compact = false,
}: {
  inspectionId: string;
  section?: string;
  online: boolean;
  compact?: boolean;
}) {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [open, setOpen] = useState(!compact);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!inspectionId || !online || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/ai/inspection-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId, section }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || "Inspection score could not refresh.");
        return;
      }

      setResult(data);
    } catch (error: any) {
      setMessage(error?.message || "Inspection score could not refresh.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [inspectionId, section, online]);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => void refresh(), 20000);
    const handleChanged = (event: Event) => {
      if (!matchesInspectionEvent(event, inspectionId, section)) return;
      window.setTimeout(() => void refresh(), 350);
    };

    window.addEventListener("opi:findings-changed", handleChanged);
    window.addEventListener("opi:section-limitations-changed", handleChanged);
    window.addEventListener("opi:offline-sync-complete", handleChanged);
    window.addEventListener("opi:inspection-evidence-changed", handleChanged);
    window.addEventListener(INSPECTION_DATA_CHANGED_EVENT, handleChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("opi:findings-changed", handleChanged);
      window.removeEventListener("opi:section-limitations-changed", handleChanged);
      window.removeEventListener("opi:offline-sync-complete", handleChanged);
      window.removeEventListener("opi:inspection-evidence-changed", handleChanged);
      window.removeEventListener(INSPECTION_DATA_CHANGED_EVENT, handleChanged);
    };
  }, [refresh]);

  const current = result?.currentSection || null;
  const topIssues = useMemo(
    () => (current?.issues?.length ? current.issues : result?.issues || []).slice(0, compact ? 3 : 8),
    [current, result, compact],
  );
  const score = result?.score || 0;

  return (
    <section className={`rounded-2xl border p-4 shadow-xl ${scoreTone(score)}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">
            Live Inspection Score
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {loading && !result ? "Reviewing…" : `${score}% complete`}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {current?.summary ||
              (result?.missingSystems?.length
                ? `${result.missingSystems.length} core system${result.missingSystems.length === 1 ? "" : "s"} still need documentation.`
                : "Core systems are documented based on available evidence.")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="relative h-16 w-16 rounded-full bg-black/25 p-1">
            <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-current text-lg font-black">
              {score}
            </div>
          </div>
          <span className="mt-1 block text-xs font-black">{open ? "Hide ↑" : "Review ↓"}</span>
        </div>
      </button>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/25">
        <div className="h-full rounded-full bg-current transition-[width] duration-500" style={{ width: `${score}%` }} />
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {current && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                <p className="text-xs font-black uppercase opacity-70">Section score</p>
                <p className="mt-1 text-xl font-black">{current.score}%</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                <p className="text-xs font-black uppercase opacity-70">Missing items</p>
                <p className="mt-1 text-xl font-black">{current.missingItems.length}</p>
              </div>
            </div>
          )}

          {topIssues.map((issue) => (
            <div key={issue.id} className={`rounded-xl border p-3 ${issueTone(issue.severity)}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-black">{issue.title}</p>
                {issue.section && (
                  <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-black">
                    {issue.section}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 opacity-90">{issue.recommendation}</p>
            </div>
          ))}

          {!topIssues.length && result && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm font-black text-emerald-100">
              ✓ No blocking completeness issues are currently detected.
            </div>
          )}

          {message && <p className="text-sm font-bold">{message}</p>}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!online || loading || !inspectionId}
            className="min-h-11 w-full rounded-xl border border-current/50 px-4 py-2 text-sm font-black active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Inspection Score"}
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(LiveInspectionScore);
