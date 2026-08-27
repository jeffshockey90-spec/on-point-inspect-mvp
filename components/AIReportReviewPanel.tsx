"use client";

import { useState } from "react";

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

  // Use the finding editor's own jump mechanism: each finding listens for this
  // event and, when its id matches, EXPANDS itself and scrolls into view (so it
  // works even when the finding card is collapsed). Same event Command Center uses.
  if (!id) return;

  // Primary: the finding's own listener expands it and scrolls into view.
  window.dispatchEvent(
    new CustomEvent("opi:command-center-jump", {
      detail: { findingIds: [id] },
    }),
  );

  // Backup: also scroll directly to the card in case its handler doesn't fire.
  window.setTimeout(() => {
    const el = document.querySelector(
      `[data-finding-id="${id.replace(/"/g, '\\"')}"]`,
    ) as HTMLElement | null;
    if (el && el.offsetParent !== null) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 300);
}

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (score >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  return "border-red-500/50 bg-red-500/10 text-red-300";
}

function recommendationTone(value: string) {
  const clean = safeText(value).toLowerCase();

  if (clean.includes("ready")) {
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  }

  if (clean.includes("do not")) {
    return "border-red-500/50 bg-red-500/10 text-red-300";
  }

  return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
}

function ReviewList({
  title,
  items,
  emptyText,
  tone = "text-[#e8ecf3]",
}: {
  title: string;
  items?: any[];
  emptyText: string;
  tone?: string;
}) {
  const cleanItems = toReviewItems(items);

  return (
    <div className="rounded-xl border border-[#232b38] bg-[#020817]/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">
          {title}
        </h3>

        <span className="rounded-full border border-[#232b38] bg-black/30 px-2 py-1 text-xs font-semibold text-[#8a93a3]">
          {cleanItems.length}
        </span>
      </div>

      {cleanItems.length === 0 ? (
        <p className="mt-3 text-sm font-bold text-emerald-300">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cleanItems.map((item, index) =>
            item.findingId !== undefined && item.findingId !== null ? (
              <li key={`${title}-${index}`}>
                <button
                  type="button"
                  onClick={() => jumpToFinding(item.findingId, item.section)}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg border border-[#232b38] bg-black/20 px-3 py-2 text-left text-sm leading-6 transition hover:border-purple-400/60 hover:bg-purple-500/10 ${tone}`}
                >
                  <span className="min-w-0">{item.text}</span>
                  <span className="mt-0.5 shrink-0 text-xs font-semibold text-purple-300">
                    Fix →
                  </span>
                </button>
              </li>
            ) : (
              <li key={`${title}-${index}`} className={`text-sm leading-6 ${tone}`}>
                {item.text}
              </li>
            ),
          )}
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
    <section className="mb-8 rounded-2xl border border-purple-500/40 bg-purple-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-300">
            AI Report Review
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-white">
            Second Set of Eyes Before Publish
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
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
          {loading ? "Reviewing Report..." : "🧠 Run AI Review"}
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3 text-sm font-bold text-purple-200">
          {message}
        </div>
      )}

      {serviceError && (
        <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-200">{serviceError.title}</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-100/90">
                {serviceError.message}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-300/80">
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
                className="rounded-lg border border-[#59626f] bg-[#131923] px-4 py-2 text-sm font-semibold text-white"
              >
                View Publish Guard
              </button>
            </div>
          </div>
          {serviceError.code && (
            <details className="mt-3 text-xs text-amber-200/70">
              <summary className="cursor-pointer font-bold">Owner diagnostics</summary>
              <p className="mt-2">Code: {serviceError.code}</p>
              {serviceError.retryAfterSeconds ? <p>Retry after: {serviceError.retryAfterSeconds}s</p> : null}
            </details>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div
          className={`rounded-xl border p-4 ${
            score === null
              ? "border-[#232b38] bg-[#020817]/70 text-[#8a93a3]"
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

        <div className={`rounded-xl border p-4 ${recommendationTone(publishRecommendation)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Publish Recommendation
          </p>

          <p className="mt-2 text-xl font-semibold">{publishRecommendation}</p>
        </div>

        <div className="rounded-xl border border-[#232b38] bg-[#020817]/70 p-4 text-[#8a93a3]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
            Report Data Reviewed
          </p>

          <p className="mt-2 text-sm">
            Findings: <span className="font-semibold text-white">{review?.findingCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Equipment: <span className="font-semibold text-white">{review?.equipmentCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Media: <span className="font-semibold text-white">{review?.photoCount ?? "—"}</span>
          </p>
        </div>
      </div>

      {safeText(review?.summary) && (
        <div className="mt-5 rounded-xl border border-[#232b38] bg-[#020817]/70 p-4 text-sm leading-7 text-[#e8ecf3]">
          {safeText(review?.summary)}
        </div>
      )}

      {review && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ReviewList
            title="Critical Issues"
            items={review.criticalIssues}
            emptyText="No critical issues found."
            tone="text-red-300"
          />

          <ReviewList
            title="Warnings"
            items={review.warnings}
            emptyText="No warnings found."
            tone="text-yellow-300"
          />

          <ReviewList
            title="Missing Systems"
            items={review.missingSystems}
            emptyText="No missing systems flagged."
          />

          <ReviewList
            title="Photo Concerns"
            items={review.photoConcerns}
            emptyText="No photo concerns found."
          />

          <ReviewList
            title="Possible Duplicates"
            items={review.duplicateConcerns}
            emptyText="No duplicate concerns found."
          />

          <ReviewList
            title="Section Concerns"
            items={review.sectionConcerns}
            emptyText="No section concerns found."
          />

          <ReviewList
            title="Suggestions"
            items={review.suggestions}
            emptyText="No extra suggestions."
          />

          <div className="rounded-xl border border-[#232b38] bg-[#020817]/70 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">
              Automated Base Checks
            </h3>

            {!review.baseIssues?.length ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                No base quality issues found.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {toReviewItems(review.baseIssues.slice(0, 8)).map((item, index) =>
                  item.findingId !== undefined && item.findingId !== null ? (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => jumpToFinding(item.findingId, item.section)}
                        className="flex w-full items-start justify-between gap-2 rounded-lg border border-[#232b38] bg-black/20 px-3 py-2 text-left text-sm leading-6 text-[#8a93a3] transition hover:border-purple-400/60 hover:bg-purple-500/10"
                      >
                        <span className="min-w-0">{item.text}</span>
                        <span className="mt-0.5 shrink-0 text-xs font-semibold text-purple-300">
                          Fix →
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={index} className="text-sm leading-6 text-[#8a93a3]">
                      {item.text}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
