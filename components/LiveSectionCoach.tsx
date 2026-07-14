"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INSPECTION_DATA_CHANGED_EVENT, matchesInspectionEvent } from "../lib/inspectionEvents";

type CoachIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  reason: string;
  recommendation: string;
  section?: string;
};

type CoachReview = {
  section: string;
  score: number;
  completedItems: string[];
  missingItems: string[];
  issues: CoachIssue[];
  canComplete: boolean;
  summary: string;
};

type Props = {
  inspectionId: string;
  section: string;
  online: boolean;
  compact?: boolean;
};

function severityClasses(severity: CoachIssue["severity"]) {
  if (severity === "critical") {
    return "border-red-500/50 bg-red-500/10 text-red-100";
  }

  if (severity === "warning") {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function scoreClasses(score: number) {
  if (score >= 90) return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
  if (score >= 70) return "border-yellow-400/50 bg-yellow-500/10 text-yellow-100";
  return "border-red-400/50 bg-red-500/10 text-red-100";
}

export default function LiveSectionCoach({ inspectionId, section, online, compact = false }: Props) {
  const [review, setReview] = useState<CoachReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState("");
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!inspectionId || !section || !online || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/ai/section-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, section }),
      });

      const data = await response.json().catch(() => ({}));
      if (requestIdRef.current !== requestId) return;

      if (!response.ok || !data?.review) {
        setMessage(data?.error || "Section Coach could not refresh.");
        return;
      }

      setReview(data.review);
    } catch (error: any) {
      if (requestIdRef.current === requestId) {
        setMessage(error?.message || "Section Coach could not refresh.");
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [inspectionId, section, online, loading]);

  useEffect(() => {
    setReview(null);
    setMessage("");
    void refresh();
  }, [inspectionId, section]);

  useEffect(() => {
    if (!inspectionId || !section || !online) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);

    function handleInspectionChange(event: Event) {
      if (!matchesInspectionEvent(event, inspectionId, section)) return;
      window.setTimeout(() => void refresh(), 350);
    }

    const events = [
      "opi:findings-changed",
      "opi:section-limitations-changed",
      "opi:reference-photos-changed",
      "opi:equipment-changed",
      "opi:offline-sync-complete",
      "opi:section-coach-refresh",
      INSPECTION_DATA_CHANGED_EVENT,
    ];

    events.forEach((name) =>
      window.addEventListener(name, handleInspectionChange as EventListener),
    );

    return () => {
      window.clearInterval(timer);
      events.forEach((name) =>
        window.removeEventListener(name, handleInspectionChange as EventListener),
      );
    };
  }, [inspectionId, section, online, refresh]);

  const importantIssues = useMemo(
    () =>
      (review?.issues || [])
        .filter((issue) => issue.severity !== "info")
        .slice(0, 6),
    [review],
  );

  async function recordChecked(issue: CoachIssue) {
    setMessage("Saving Section Coach memory...");

    try {
      await fetch("/api/ai/inspection-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          section,
          eventType: "section_coach_item",
          status: "checked",
          title: issue.title,
          detail: issue.recommendation || issue.reason,
          payload: { issueId: issue.id, severity: issue.severity },
        }),
      });

      setMessage("Marked checked. Section completeness is refreshing.");
      window.dispatchEvent(
        new CustomEvent("opi:section-coach-refresh", {
          detail: { inspectionId, section },
        }),
      );
      window.setTimeout(() => void refresh(), 350);
    } catch (error: any) {
      setMessage(error?.message || "Could not save Section Coach memory.");
    }
  }

  function requestEvidencePhoto(issue: CoachIssue) {
    window.dispatchEvent(
      new CustomEvent("opi:coach-capture-request", {
        detail: {
          inspectionId,
          section,
          id: issue.id,
          title: issue.title,
          recommendation: issue.recommendation,
        },
      }),
    );
  }

  function requestLimitation(issue: CoachIssue) {
    window.dispatchEvent(
      new CustomEvent("opi:coach-limitation-request", {
        detail: {
          inspectionId,
          section,
          id: issue.id,
          title: issue.title,
          recommendation: issue.recommendation,
        },
      }),
    );
  }

  return (
    <section className={`rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
            Section Coach
          </p>
          <h2 className="mt-1 text-xl font-black">{section}</h2>
          {!compact && (
            <p className="mt-1 text-sm text-slate-300">
              Live completeness guidance based on saved findings, photos, equipment, checklist selections, limitations, and inspector confirmations.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {review && (
            <span
              className={`rounded-full border px-3 py-2 text-sm font-black ${scoreClasses(
                review.score,
              )}`}
            >
              {review.score}%
            </span>
          )}

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="min-h-11 rounded-xl border border-emerald-400/60 px-4 py-2 text-sm font-black text-emerald-100 active:scale-[0.98]"
          >
            {open ? "Collapse" : "Open"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {!online && (
            <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm font-bold text-yellow-100">
              Section Coach will refresh when internet service returns. Your offline findings and photos can still be queued normally.
            </div>
          )}

          {review && (
            <div className="rounded-xl border border-slate-700 bg-black/30 p-3">
              <p className="text-sm font-bold leading-6 text-slate-200">{review.summary}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, review.score))}%` }}
                />
              </div>
            </div>
          )}

          {importantIssues.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
                Before You Leave This Section
              </p>

              {importantIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-xl border p-3 ${severityClasses(issue.severity)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-black">□ {issue.title}</p>
                      <p className="mt-1 text-sm leading-5 opacity-90">{issue.reason}</p>
                      {issue.recommendation && (
                        <p className="mt-2 text-xs font-bold opacity-80">
                          {issue.recommendation}
                        </p>
                      )}
                    </div>

                    <div className="grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => requestEvidencePhoto(issue)}
                        className="min-h-10 rounded-lg border border-current px-3 py-2 text-xs font-black active:scale-[0.98]"
                      >
                        📷 Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => requestLimitation(issue)}
                        className="min-h-10 rounded-lg border border-current px-3 py-2 text-xs font-black active:scale-[0.98]"
                      >
                        Limitation
                      </button>
                      <button
                        type="button"
                        onClick={() => void recordChecked(issue)}
                        className="min-h-10 rounded-lg border border-current px-3 py-2 text-xs font-black active:scale-[0.98]"
                      >
                        ✓ Checked
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : review ? (
            <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm font-black text-emerald-100">
              ✓ No blocking Section Coach items are currently detected.
            </div>
          ) : null}

          {review?.completedItems?.length ? (
            <details className="rounded-xl border border-slate-700 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-black text-slate-200">
                Completed coverage ({review.completedItems.length})
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {review.completedItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200"
                  >
                    ✓ {item}
                  </span>
                ))}
              </div>
            </details>
          ) : null}

          {message && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm font-bold text-cyan-100">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!online || loading || !inspectionId}
            className="min-h-11 w-full rounded-xl border border-emerald-400/60 px-4 py-2 text-sm font-black text-emerald-100 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Refreshing Section Coach..." : "Refresh Section Coach"}
          </button>
        </div>
      )}
    </section>
  );
}
