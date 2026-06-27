"use client";

import { useState } from "react";

type AIReportReviewResult = {
  score?: number;
  passed?: boolean;
  summary?: string;
  criticalIssues?: string[];
  warnings?: string[];
  suggestions?: string[];
  missingSystems?: string[];
  duplicateConcerns?: string[];
  sectionConcerns?: string[];
  photoConcerns?: string[];
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

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (score >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  return "border-red-500/50 bg-red-500/10 text-red-300";
}

function recommendationTone(value: string) {
  const clean = value.toLowerCase();

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
  tone = "text-slate-200",
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone?: string;
}) {
  const cleanItems = (items || []).filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
          {title}
        </h3>

        <span className="rounded-full border border-slate-600 bg-black/30 px-2 py-1 text-xs font-black text-slate-300">
          {cleanItems.length}
        </span>
      </div>

      {cleanItems.length === 0 ? (
        <p className="mt-3 text-sm font-bold text-emerald-300">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cleanItems.map((item, index) => (
            <li key={`${title}-${index}`} className={`text-sm leading-6 ${tone}`}>
              {item}
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

  async function runReview() {
    if (loading) return;

    setLoading(true);
    setMessage("");

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
        setMessage(data.error || "AI report review failed.");
        return;
      }

      setReview(data);
      setMessage("AI report review completed.");
    } catch (error: any) {
      setMessage(error?.message || "AI report review failed.");
    } finally {
      setLoading(false);
    }
  }

  const score =
    typeof review?.score === "number" && Number.isFinite(review.score)
      ? review.score
      : null;

  const publishRecommendation =
    review?.publishRecommendation || "Run AI Review before publishing.";

  return (
    <section className="mb-8 rounded-2xl border border-purple-500/40 bg-purple-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-purple-300">
            AI Report Review
          </p>

          <h2 className="mt-1 text-2xl font-black text-white">
            Second Set of Eyes Before Publish
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Runs an AI quality check for missing recommendations, missing implications,
            missing photos, duplicate concerns, section issues, equipment documentation,
            and report completeness. Inspector has final say.
          </p>
        </div>

        <button
          type="button"
          onClick={runReview}
          disabled={loading}
          className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Reviewing Report..." : "🧠 Run AI Review"}
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3 text-sm font-bold text-purple-200">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div
          className={`rounded-xl border p-4 ${
            score === null
              ? "border-slate-700 bg-[#020817]/70 text-slate-300"
              : scoreTone(score)
          }`}
        >
          <p className="text-xs font-black uppercase tracking-wide opacity-80">
            Report Score
          </p>

          <p className="mt-2 text-4xl font-black">
            {score === null ? "—" : score}
            {score !== null && <span className="text-xl opacity-80"> / 100</span>}
          </p>
        </div>

        <div className={`rounded-xl border p-4 ${recommendationTone(publishRecommendation)}`}>
          <p className="text-xs font-black uppercase tracking-wide opacity-80">
            Publish Recommendation
          </p>

          <p className="mt-2 text-xl font-black">{publishRecommendation}</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4 text-slate-300">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Report Data Reviewed
          </p>

          <p className="mt-2 text-sm">
            Findings: <span className="font-black text-white">{review?.findingCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Equipment: <span className="font-black text-white">{review?.equipmentCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm">
            Media: <span className="font-black text-white">{review?.photoCount ?? "—"}</span>
          </p>
        </div>
      </div>

      {review?.summary && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-4 text-sm leading-7 text-slate-100">
          {review.summary}
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

          <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
              Automated Base Checks
            </h3>

            {!review.baseIssues?.length ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                No base quality issues found.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {review.baseIssues.slice(0, 8).map((issue, index) => (
                  <li key={index} className="text-sm leading-6 text-slate-300">
                    {issue.message || "Quality check item"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
