"use client";

import { useEffect, useState } from "react";

// Cache the last AI review per inspection so navigating away to fix a finding and
// coming back shows the SAME list to work through — instead of forcing a full
// (slow, paid) re-run every time. The inspector re-runs only when they choose to.
const reviewStorageKey = (id: string) => `fl-ai-review-${id}`;

type AIReportReviewResult = {
  score?: number;
  passed?: boolean;
  summary?: string;
  criticalIssues?: any[];
  warnings?: any[];
  suggestions?: any[];
  missingSystems?: any[];
  duplicateConcerns?: any[];
  sectionConcerns?: any[];
  photoConcerns?: any[];
  publishRecommendation?: string;
  baseIssues?: Array<{
    level?: string;
    category?: string;
    message?: string;
    section?: string;
    findingId?: string | number;
  }>;
  findingCount?: number;
  equipmentCount?: number;
  photoCount?: number;
  aiModel?: string;
  aiVersion?: string;
};

function safeText(value: any): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map(safeText).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return (
      value.message ||
      value.title ||
      value.issue ||
      value.concern ||
      value.description ||
      value.text ||
      JSON.stringify(value)
    );
  }

  return String(value);
}

function safeList(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(safeText).filter(Boolean);
}

type ReviewItem = { text: string; findingId?: string | number; section?: string };

// Keep each review item's text AND its finding/section reference so the item can
// link straight to the finding it's about.
function toReviewItems(value: any): ReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const text = safeText(entry);
      if (!text) return null;
      const obj = entry && typeof entry === "object" ? entry : {};
      const rawId = obj.findingId ?? obj.finding_id ?? obj.findingID;
      // Treat an empty/blank id as no id, so we don't render a dead "Fix →".
      const findingId =
        rawId !== undefined && rawId !== null && String(rawId).trim() !== ""
          ? rawId
          : undefined;
      const section = safeText(obj.section) || undefined;
      return { text, findingId, section } as ReviewItem;
    })
    .filter(Boolean) as ReviewItem[];
}

// Scroll the report to the finding an item references and flash it, revealing the
// findings section first if it isn't on screen yet.
function jumpToFinding(findingId?: string | number, section?: string) {
  if (typeof window === "undefined") return;
  const id = findingId === undefined || findingId === null ? "" : String(findingId).trim();

  // No finding id at all (e.g. a whole-report concern) → jump to the section.
  if (!id) {
    if (section) {
      window.dispatchEvent(
        new CustomEvent("opi:command-center-jump", { detail: { section } }),
      );
    }
    return;
  }

  // Primary: the report's jump handler opens the finding's section (even if
  // collapsed) and scrolls/expands the finding. `section` is a fallback target.
  window.dispatchEvent(
    new CustomEvent("opi:command-center-jump", {
      detail: { findingIds: [id], section },
    }),
  );

  // The finding's section may need to open + render first, so POLL for the card
  // for ~1.5s rather than a single 300ms shot. If it never appears — the finding
  // was combined/deleted since the review ran, or the id didn't match — fall back
  // to its section so the click still lands the inspector in the right place.
  let tries = 0;
  const selector = `[data-finding-id="${id.replace(/"/g, '\\"')}"]`;
  const timer = window.setInterval(() => {
    tries += 1;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      window.clearInterval(timer);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (tries >= 9) {
      window.clearInterval(timer);
      if (section) {
        window.dispatchEvent(
          new CustomEvent("opi:command-center-jump", { detail: { section } }),
        );
      }
    }
  }, 170);
}

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]";
  if (score >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  return "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]";
}

function recommendationTone(value: string) {
  const clean = safeText(value).toLowerCase();

  if (clean.includes("ready")) {
    return "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]";
  }

  if (clean.includes("do not")) {
    return "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]";
  }

  return "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
}

// Live set of finding ids the inspector has marked reviewed in the Command
// Center (localStorage, updated by markFindingReviewedForCommandCenter). Lets the
// review list dim items as they're handled so the inspector works down to zero
// without re-running — updates on the reviewed-changed event and on tab focus.
function useReviewedFindings(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("opi-command-center-reviewed-findings");
        const arr = raw ? JSON.parse(raw) : [];
        setIds(new Set((Array.isArray(arr) ? arr : []).map((v: any) => String(v))));
      } catch {
        setIds(new Set());
      }
    };
    read();
    window.addEventListener("opi:reviewed-findings-changed", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("opi:reviewed-findings-changed", read);
      window.removeEventListener("focus", read);
    };
  }, []);
  return ids;
}

// Manual "knocked off" state: the inspector can check any review item off as
// they address it — even items with no finding to mark reviewed (missing
// photos, completeness, suggestions). Persisted per inspection so it survives
// leaving and coming back. Keyed by list + item text so unchanged items keep
// their check across a re-run. localStorage matches the review cache above.
const doneStorageKey = (id: string) => `fl-ai-review-done-${id}`;

function itemKey(listTitle: string, text: string) {
  return `${listTitle}::${text}`;
}

function readDone(inspectionId: string): Set<string> {
  try {
    const raw = localStorage.getItem(doneStorageKey(inspectionId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(arr) ? arr : []).map((v: any) => String(v)));
  } catch {
    return new Set();
  }
}

function writeDone(inspectionId: string, set: Set<string>) {
  try {
    localStorage.setItem(doneStorageKey(inspectionId), JSON.stringify([...set]));
  } catch {
    /* best-effort */
  }
  window.dispatchEvent(new CustomEvent("opi:ai-review-done-changed"));
}

// Shared checked-off set for this inspection, kept in sync across every list on
// the panel (and across tab focus) via a custom event.
function useDoneItems(inspectionId: string) {
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    const read = () => setDoneSet(readDone(inspectionId));
    read();
    window.addEventListener("opi:ai-review-done-changed", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("opi:ai-review-done-changed", read);
      window.removeEventListener("focus", read);
    };
  }, [inspectionId]);

  const toggle = (key: string) => {
    const next = readDone(inspectionId);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    writeDone(inspectionId, next);
    setDoneSet(next);

    // Persist to the server so the checklist state survives an app restart and
    // syncs across devices (best-effort; the local cache already updated).
    fetch("/api/ai/report-review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, done: [...next] }),
    }).catch(() => {
      /* offline / pre-migration — local cache still holds it */
    });
  };

  return { doneSet, toggle };
}

function ReviewItemRow({
  item,
  handled,
  onToggle,
  tone = "text-[var(--fl-text)]",
}: {
  item: ReviewItem;
  handled: boolean;
  onToggle: () => void;
  tone?: string;
}) {
  const hasFinding = item.findingId !== undefined && item.findingId !== null;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-6 transition ${
        handled
          ? "border-emerald-500/40 bg-emerald-500/5 opacity-75 hover:opacity-100"
          : "border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={handled}
        aria-label={handled ? "Mark as not done" : "Mark as done"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold [touch-action:manipulation] ${
          handled
            ? "border-emerald-500 bg-emerald-500 text-slate-950"
            : "border-[var(--fl-faint)] text-transparent hover:border-purple-400"
        }`}
      >
        ✓
      </button>

      {hasFinding ? (
        <button
          type="button"
          onClick={() => jumpToFinding(item.findingId, item.section)}
          className={`min-w-0 flex-1 text-left transition ${
            handled ? "text-[var(--fl-muted)] line-through" : `${tone} hover:text-[var(--fl-purple-text)]`
          }`}
        >
          {item.text}
        </button>
      ) : (
        <span className={`min-w-0 flex-1 ${handled ? "text-[var(--fl-muted)] line-through" : tone}`}>
          {item.text}
        </span>
      )}

      {hasFinding && (
        <span
          className={`mt-0.5 shrink-0 text-xs font-semibold ${
            handled ? "text-[var(--fl-good-text)]" : "text-[var(--fl-purple-text)]"
          }`}
        >
          {handled ? "✓ Done" : "Fix →"}
        </span>
      )}
    </div>
  );
}

function ReviewList({
  title,
  items,
  emptyText,
  doneSet,
  onToggle,
  tone = "text-[var(--fl-text)]",
}: {
  title: string;
  items?: any[];
  emptyText: string;
  doneSet: Set<string>;
  onToggle: (key: string) => void;
  tone?: string;
}) {
  const reviewedIds = useReviewedFindings();
  // An item is "handled" if the inspector checked it off here OR its finding was
  // marked reviewed elsewhere. Handled items sink to the bottom, dimmed, so the
  // next thing to fix is always on top — but they never disappear.
  const cleanItems = toReviewItems(items)
    .map((item) => {
      const reviewed =
        item.findingId !== undefined &&
        item.findingId !== null &&
        reviewedIds.has(String(item.findingId));
      const key = itemKey(title, item.text);
      const handled = reviewed || doneSet.has(key);
      return { ...item, key, handled };
    })
    .sort((a, b) => Number(a.handled) - Number(b.handled));
  const remaining = cleanItems.filter((i) => !i.handled).length;

  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
          {title}
        </h3>

        <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--fl-muted)]">
          {remaining < cleanItems.length ? `${remaining} left` : cleanItems.length}
        </span>
      </div>

      {cleanItems.length === 0 ? (
        <p className="mt-3 text-sm font-bold text-[var(--fl-good-text)]">{emptyText}</p>
      ) : remaining === 0 ? (
        <p className="mt-3 text-sm font-bold text-[var(--fl-good-text)]">
          All handled — every item here is checked off. ✓
        </p>
      ) : null}

      {cleanItems.length > 0 && (
        <ul className="mt-3 space-y-2">
          {cleanItems.map((item, index) => (
            <li key={`${title}-${index}`}>
              <ReviewItemRow
                item={item}
                handled={item.handled}
                tone={tone}
                onToggle={() => onToggle(item.key)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AIReportReviewPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [review, setReview] = useState<AIReportReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [serviceError, setServiceError] = useState<null | {
    title: string;
    message: string;
    code?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
  }>(null);

  // One shared checked-off set for the whole panel so every list stays in sync
  // and check-offs never bounce back.
  const { doneSet, toggle: onToggleItem } = useDoneItems(inspectionId);

  // Restore the saved review on mount so returning to the panel shows the list
  // to keep working through — never a blank "Run AI Review" prompt, and never a
  // forced re-run. Local cache paints instantly; the server (source of truth,
  // per single-source-of-truth) then hydrates so it survives an app restart and
  // syncs across devices.
  useEffect(() => {
    let alive = true;

    try {
      const raw = localStorage.getItem(reviewStorageKey(inspectionId));
      if (raw) setReview(JSON.parse(raw));
    } catch {
      /* storage may be unavailable or hold a stale shape */
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/ai/report-review?inspection_id=${encodeURIComponent(inspectionId)}`,
          { cache: "no-store" },
        );
        if (!res.ok || !alive) return;
        const data = await res.json().catch(() => ({}));
        if (!alive) return;

        if (data?.review) {
          setReview(data.review);
          try {
            localStorage.setItem(reviewStorageKey(inspectionId), JSON.stringify(data.review));
          } catch {
            /* best-effort cache */
          }
        }
        if (Array.isArray(data?.done)) {
          // MERGE (union) server check-offs with whatever the inspector may have
          // already tapped while this fetch was in flight — never overwrite, or
          // a slow load would wipe a just-made check-off (the bounce-back bug).
          try {
            const local = readDone(inspectionId);
            const merged = new Set<string>([...local, ...data.done.map((v: any) => String(v))]);
            localStorage.setItem(doneStorageKey(inspectionId), JSON.stringify([...merged]));
          } catch {
            /* best-effort cache */
          }
          window.dispatchEvent(new CustomEvent("opi:ai-review-done-changed"));
        }
      } catch {
        /* offline / pre-migration — the local cache above still applies */
      }
    })();

    return () => {
      alive = false;
    };
  }, [inspectionId]);

  async function runReview() {
    if (loading) return;

    setLoading(true);
    setMessage("");
    setServiceError(null);

    try {
      const res = await fetch("/api/ai/report-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          inspection_id: inspectionId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setServiceError({
          title: safeText(data.title) || "AI review unavailable",
          message: safeText(data.error) || "AI report review failed.",
          code: safeText(data.code),
          retryable: Boolean(data.retryable),
          retryAfterSeconds: Number(data.retryAfterSeconds) || undefined,
        });
        return;
      }

      setReview(data);
      try {
        localStorage.setItem(reviewStorageKey(inspectionId), JSON.stringify(data));
      } catch {
        /* best-effort cache */
      }
      setMessage("AI report review completed.");
    } catch (error: any) {
      setServiceError({
        title: "AI connection unavailable",
        message: "The app could not reach the AI service. Your report is safe; retry when the connection is available.",
        code: "network_error",
        retryable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  const score =
    typeof review?.score === "number" && Number.isFinite(review.score)
      ? review.score
      : null;

  const publishRecommendation =
    safeText(review?.publishRecommendation) || "Run AI Review before publishing.";

  return (
    <section className="mb-8 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-purple-text)]">
            AI Report Review
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            Second Set of Eyes Before Publish
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
            Runs an AI quality check for missing recommendations, missing implications,
            missing photos, duplicate concerns, section issues, equipment documentation,
            and report completeness. Inspector has final say.
          </p>
        </div>

        <button
          type="button"
          onClick={runReview}
          disabled={loading}
          className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Reviewing Report..."
            : review
              ? "🔄 Re-run AI Review"
              : "🧠 Run AI Review"}
        </button>
      </div>

      {review && !loading && (
        <p className="mt-2 text-xs font-semibold text-[var(--fl-purple-text)]">
          Showing your last review — tap the ✓ to check off each item as you handle
          it. Your progress is saved, so you can leave and come back without
          re-running. Only re-run when you&apos;ve made changes you want re-checked.
        </p>
      )}

      {message && (
        <div className="mt-4 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3 text-sm font-bold text-[var(--fl-purple-text)]">
          {message}
        </div>
      )}

      {serviceError && (
        <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--fl-warn-text)]">{serviceError.title}</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fl-warn-text)]">
                {serviceError.message}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-[var(--fl-warn-text)]">
                Your report is safe. Publish Guard remains available.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {serviceError.retryable && (
                <button
                  type="button"
                  onClick={runReview}
                  disabled={loading}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  Retry AI Review
                </button>
              )}
              <button
                type="button"
                onClick={() => document.getElementById("publish-guard")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-lg border border-[var(--fl-faint)] bg-[var(--fl-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)]"
              >
                View Publish Guard
              </button>
            </div>
          </div>
          {serviceError.code && (
            <details className="mt-3 text-xs text-[var(--fl-warn-text)]">
              <summary className="cursor-pointer font-bold">Owner diagnostics</summary>
              <p className="mt-2">Code: {serviceError.code}</p>
              {serviceError.retryAfterSeconds ? <p>Retry after: {serviceError.retryAfterSeconds}s</p> : null}
            </details>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <div
          className={`min-w-0 rounded-xl border p-4 ${
            score === null
              ? "border-[var(--fl-line)] bg-[var(--fl-ground)] text-[var(--fl-muted)]"
              : scoreTone(score)
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Report Score
          </p>

          <p className="mt-2 text-4xl font-semibold">
            {score === null ? "—" : score}
            {score !== null && <span className="text-xl opacity-80"> / 100</span>}
          </p>
        </div>

        <div className={`min-w-0 rounded-xl border p-4 ${recommendationTone(publishRecommendation)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Publish Recommendation
          </p>

          <p className="mt-2 break-words text-lg font-semibold leading-snug">{publishRecommendation}</p>
        </div>

        <div className="min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-muted)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Report Data Reviewed
          </p>

          <p className="mt-2 text-sm">
            Findings: <span className="font-semibold text-[var(--fl-text)]">{review?.findingCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Equipment: <span className="font-semibold text-[var(--fl-text)]">{review?.equipmentCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Media: <span className="font-semibold text-[var(--fl-text)]">{review?.photoCount ?? "—"}</span>
          </p>
        </div>
      </div>

      {safeText(review?.summary) && (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-sm leading-7 text-[var(--fl-text)]">
          {safeText(review?.summary)}
        </div>
      )}

      {review && (
        <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <ReviewList
            title="Critical Issues"
            items={review.criticalIssues}
            emptyText="No critical issues found."
            doneSet={doneSet}
            onToggle={onToggleItem}
            tone="text-[var(--fl-crit-text)]"
          />

          <ReviewList
            title="Warnings"
            items={review.warnings}
            emptyText="No warnings found."
            doneSet={doneSet}
            onToggle={onToggleItem}
            tone="text-[var(--fl-warn-text)]"
          />

          <ReviewList
            title="Missing Systems"
            items={review.missingSystems}
            emptyText="No missing systems flagged."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />

          <ReviewList
            title="Photo Concerns"
            items={review.photoConcerns}
            emptyText="No photo concerns found."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />

          <ReviewList
            title="Possible Duplicates"
            items={review.duplicateConcerns}
            emptyText="No duplicate concerns found."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />

          <ReviewList
            title="Section Concerns"
            items={review.sectionConcerns}
            emptyText="No section concerns found."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />

          <ReviewList
            title="Suggestions"
            items={review.suggestions}
            emptyText="No extra suggestions."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />

          <ReviewList
            title="Automated Base Checks"
            items={review.baseIssues}
            emptyText="No base quality issues found."
            doneSet={doneSet}
            onToggle={onToggleItem}
          />
        </div>
      )}
    </section>
  );
}
