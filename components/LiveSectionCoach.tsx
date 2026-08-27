"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INSPECTION_DATA_CHANGED_EVENT,
  matchesInspectionEvent,
} from "../lib/inspectionEvents";

type CoachIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  reason: string;
  recommendation: string;
  section?: string;
  action?: string;
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
    return "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]";
  }

  if (severity === "warning") {
    return "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-[var(--fl-info-text)]";
}

function scoreClasses(score: number) {
  if (score >= 90) {
    return "border-emerald-400/50 bg-emerald-500/10 text-[var(--fl-good-text)]";
  }

  if (score >= 70) {
    return "border-yellow-400/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  }

  return "border-red-400/50 bg-red-500/10 text-[var(--fl-crit-text)]";
}

function dispatchCoachEvent(
  name: "opi:coach-capture-request" | "opi:coach-limitation-request",
  issue: CoachIssue,
  inspectionId: string,
  section: string,
) {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        id: issue.id,
        title: issue.title,
        recommendation: issue.recommendation,
        reason: issue.reason,
        severity: issue.severity,
        inspectionId,
        section,
      },
    }),
  );
}

export default function LiveSectionCoach({
  inspectionId,
  section,
  online,
  compact = false,
}: Props) {
  const [review, setReview] = useState<CoachReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState("");
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!inspectionId || !section || !online || loadingRef.current) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingRef.current = true;
    setLoading(true);

    try {
      const response = await fetch("/api/ai/section-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId, section }),
      });

      const data = await response.json().catch(() => ({}));

      if (requestIdRef.current !== requestId) return;

      if (!response.ok || !data?.review) {
        setMessage(data?.error || "Section Coach could not refresh.");
        return;
      }

      setReview(data.review);
      setMessage("");
    } catch (error: any) {
      if (requestIdRef.current === requestId) {
        setMessage(error?.message || "Section Coach could not refresh.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [inspectionId, section, online]);

  useEffect(() => {
    setReview(null);
    setMessage("");
    void refresh();
  }, [inspectionId, section, refresh]);

  useEffect(() => {
    if (!inspectionId || !section || !online) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);

    function handleInspectionChange(event: Event) {
      if (!matchesInspectionEvent(event, inspectionId, section)) return;
      window.setTimeout(() => void refresh(), 250);
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
        window.removeEventListener(
          name,
          handleInspectionChange as EventListener,
        ),
      );
    };
  }, [inspectionId, section, online, refresh]);

  const importantIssues = useMemo(
    () =>
      (review?.issues || [])
        .filter((issue) => issue.severity !== "info")
        .slice(0, compact ? 4 : 6),
    [review, compact],
  );

  const completedCount = review?.completedItems?.length || 0;
  const reminderCount = importantIssues.length;
  const photoNeededCount = importantIssues.filter((issue) => {
    const text = `${issue.title} ${issue.reason} ${issue.recommendation}`.toLowerCase();
    return (
      text.includes("photo") ||
      text.includes("document") ||
      text.includes("evidence") ||
      issue.action === "photo"
    );
  }).length;

  async function recordChecked(issue: CoachIssue) {
    setMessage("Saving completion...");

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

      setMessage("Marked complete.");
      window.dispatchEvent(
        new CustomEvent("opi:section-coach-refresh", {
          detail: { inspectionId, section },
        }),
      );
      window.setTimeout(() => void refresh(), 250);
    } catch (error: any) {
      setMessage(error?.message || "Could not save Section Coach memory.");
    }
  }

  return (
    <section
      className={`rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-white ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-good-text)]">
            Section Coach
          </p>
          {!compact && (
            <h2 className="mt-1 truncate text-xl font-semibold">{section}</h2>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {review && (
            <span
              className={`rounded-full border px-3 py-2 text-sm font-semibold ${scoreClasses(
                review.score,
              )}`}
            >
              {review.score}%
            </span>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!online || loading || !inspectionId}
            aria-label="Refresh Section Coach"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/50 bg-[var(--fl-surface-2)] text-lg font-semibold text-[var(--fl-good-text)] active:scale-95 disabled:opacity-40"
          >
            {loading ? "…" : "↻"}
          </button>

          {!compact && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="min-h-10 rounded-xl border border-emerald-400/60 px-3 py-2 text-xs font-semibold text-[var(--fl-good-text)] active:scale-[0.98]"
            >
              {open ? "Collapse" : "Open"}
            </button>
          )}
        </div>
      </div>

      {(open || compact) && (
        <div className="mt-3 space-y-3">
          {!online && (
            <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm font-bold text-[var(--fl-warn-text)]">
              Section Coach will refresh when internet service returns.
            </div>
          )}

          {review && (
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-sm font-bold leading-5 text-[var(--fl-text)]">
                {review.summary}
              </p>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--fl-raised)]">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, review.score))}%`,
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2">
                  <p className="text-base font-semibold text-[var(--fl-good-text)]">
                    {completedCount}
                  </p>
                  <p className="text-[10px] font-bold text-[var(--fl-muted)]">
                    Verified
                  </p>
                </div>

                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 py-2">
                  <p className="text-base font-semibold text-[var(--fl-warn-text)]">
                    {reminderCount}
                  </p>
                  <p className="text-[10px] font-bold text-[var(--fl-muted)]">
                    Reminders
                  </p>
                </div>

                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-2">
                  <p className="text-base font-semibold text-[var(--fl-info-text)]">
                    {photoNeededCount}
                  </p>
                  <p className="text-[10px] font-bold text-[var(--fl-muted)]">
                    Photos
                  </p>
                </div>
              </div>
            </div>
          )}

          {importantIssues.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fl-warn-text)]">
                Before You Leave This Section
              </p>

              {importantIssues.map((issue) => (
                <article
                  key={issue.id}
                  className={`rounded-xl border p-3 ${severityClasses(
                    issue.severity,
                  )}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      □ {issue.title}
                    </p>
                    <p className="mt-1 text-sm leading-5 opacity-90">
                      {issue.reason}
                    </p>
                    {issue.recommendation && (
                      <p className="mt-2 text-xs font-bold leading-4 opacity-80">
                        {issue.recommendation}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        dispatchCoachEvent(
                          "opi:coach-capture-request",
                          issue,
                          inspectionId,
                          section,
                        )
                      }
                      className="min-h-11 rounded-lg border border-current bg-[var(--fl-surface-2)] px-2 py-2 text-xs font-semibold active:scale-[0.97]"
                    >
                      📷 Photo
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        dispatchCoachEvent(
                          "opi:coach-limitation-request",
                          issue,
                          inspectionId,
                          section,
                        )
                      }
                      className="min-h-11 rounded-lg border border-current bg-[var(--fl-surface-2)] px-2 py-2 text-xs font-semibold active:scale-[0.97]"
                    >
                      ⚠ Limit
                    </button>

                    <button
                      type="button"
                      onClick={() => void recordChecked(issue)}
                      className="min-h-11 rounded-lg border border-current bg-[var(--fl-surface-2)] px-2 py-2 text-xs font-semibold active:scale-[0.97]"
                    >
                      ✓ Complete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : review ? (
            <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm font-semibold text-[var(--fl-good-text)]">
              ✓ No blocking Section Coach items are currently detected.
            </div>
          ) : null}

          {review?.completedItems?.length ? (
            <details className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--fl-text)]">
                Completed coverage ({review.completedItems.length})
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {review.completedItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-[var(--fl-good-text)]"
                  >
                    ✓ {item}
                  </span>
                ))}
              </div>
            </details>
          ) : null}

          {message && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm font-bold text-[var(--fl-info-text)]">
              {message}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
