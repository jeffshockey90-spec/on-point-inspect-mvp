"use client";

import { useCallback, useState } from "react";

type PublishGuardIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  section?: string;
  reason: string;
  recommendation: string;
  blocking?: boolean;
};

type PublishGuardResult = {
  score: number;
  readyToPublish: boolean;
  blocked: boolean;
  recommendation: "Ready" | "Review Recommended" | "Do Not Publish Yet";
  issues: PublishGuardIssue[];
  criticalIssues: PublishGuardIssue[];
  warnings: PublishGuardIssue[];
  suggestions: string[];
  findingCount: number;
  equipmentCount: number;
  photoCount: number;
};

function scoreTone(score?: number) {
  const value = Number(score || 0);
  if (value >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (value >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  return "border-red-500/50 bg-red-500/10 text-red-300";
}

function issueTone(severity?: string) {
  if (severity === "critical") return "border-red-500/50 bg-red-500/10 text-red-200";
  if (severity === "warning") return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function recommendationTone(value?: string) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("ready") && !clean.includes("not")) {
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  }

  if (clean.includes("do not")) {
    return "border-red-500/50 bg-red-500/10 text-red-300";
  }

  return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
}

function IssueCard({ issue }: { issue: PublishGuardIssue }) {
  return (
    <div className={`rounded-xl border p-3 ${issueTone(issue.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-black">{issue.title}</p>
        <div className="flex flex-wrap gap-2">
          {issue.blocking && (
            <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-black">
              Blocking
            </span>
          )}
          {issue.section && (
            <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-black">
              {issue.section}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-90">{issue.reason}</p>
      <p className="mt-2 text-xs font-bold leading-5">{issue.recommendation}</p>
    </div>
  );
}

export default function AIPublishGuardPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [result, setResult] = useState<PublishGuardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const runGuard = useCallback(async () => {
    if (!inspectionId || loading) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai/publish-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          inspectionId,
          inspection_id: inspectionId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.error || "AI Publish Guard failed.");
        return;
      }

      setResult(data);
      setMessage(
        data.blocked
          ? "AI Publish Guard recommends reviewing the report before publishing."
          : "AI Publish Guard completed."
      );
    } catch (error: any) {
      setMessage(error?.message || "AI Publish Guard failed.");
    } finally {
      setLoading(false);
    }
  }, [inspectionId, loading]);

  const score = result?.score ?? null;
  const topIssues = result?.issues?.slice(0, 8) || [];

  return (
    <section className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">
            AI Publish Guard
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Final Report Safety Check
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Checks the full report for missing recommendations, incomplete systems, contradictions, missing media, and publish-blocking issues before the report goes out.
          </p>
        </div>

        <button
          type="button"
          onClick={runGuard}
          disabled={loading || !inspectionId}
          className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Checking..." : "Run Publish Guard"}
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className={`rounded-xl border p-4 ${score === null ? "border-slate-700 bg-[#020817]/70 text-slate-300" : scoreTone(score)}`}>
          <p className="text-xs font-black uppercase tracking-wide opacity-80">
            Publish Score
          </p>
          <p className="mt-1 text-3xl font-black">
            {score === null ? "—" : score}
            {score !== null && <span className="text-base opacity-80"> / 100</span>}
          </p>
        </div>

        <div className={`rounded-xl border p-4 ${recommendationTone(result?.recommendation)}`}>
          <p className="text-xs font-black uppercase tracking-wide opacity-80">
            Recommendation
          </p>
          <p className="mt-1 text-xl font-black">
            {result?.recommendation || "Not checked yet"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Reviewed
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Findings: <span className="font-black text-white">{result?.findingCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Equipment: <span className="font-black text-white">{result?.equipmentCount ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Media: <span className="font-black text-white">{result?.photoCount ?? "—"}</span>
          </p>
        </div>
      </div>

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
                Publish Guard Issues
              </h3>
              <span className="rounded-full border border-slate-600 bg-black/30 px-2 py-1 text-xs font-black text-slate-300">
                {topIssues.length}
              </span>
            </div>

            {topIssues.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                No publish guard issues detected.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {topIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
              Final Suggestions
            </h3>

            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              {(result.suggestions?.length ? result.suggestions : [
                "Perform final inspector review before publishing.",
              ]).map((item, index) => (
                <li key={index}>✓ {item}</li>
              ))}
            </ul>

            {result.blocked && (
              <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold leading-6 text-red-100">
                AI Publish Guard found a blocking issue. Review the items above before publishing.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
