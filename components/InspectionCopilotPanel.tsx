"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CopilotIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  section?: string;
  reason: string;
  recommendation: string;
};

type RelatedFindingCluster = {
  id: string;
  title: string;
  confidence: number;
  findings: Array<{
    id?: string | number;
    title: string;
    section?: string;
    severity?: string;
  }>;
  explanation: string;
  recommendation: string;
};

type CopilotResult = {
  score: number;
  confidence: number;
  status: "Monitoring" | "Needs Review" | "Ready";
  completedSystems: string[];
  missingSystems: string[];
  priorityIssues: CopilotIssue[];
  contradictions: CopilotIssue[];
  relatedFindings: RelatedFindingCluster[];
  suggestions: string[];
  answer?: string;
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

function quickQuestions() {
  return [
    "What did I miss?",
    "Is this ready to publish?",
    "Any contradictions?",
    "Show related findings",
    "Why did confidence drop?",
  ];
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function IssueCard({ issue }: { issue: CopilotIssue }) {
  return (
    <div className={`rounded-xl border p-3 ${issueTone(issue.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-black">{issue.title}</p>
        {issue.section && (
          <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-black opacity-90">
            {issue.section}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 opacity-90">{issue.reason}</p>
      <p className="mt-2 text-xs font-bold leading-5">{issue.recommendation}</p>
      <button
        type="button"
        onClick={() => jumpToIssue(issue)}
        className="mt-3 rounded-lg border border-current/40 px-3 py-1.5 text-xs font-black transition active:scale-[0.98] hover:bg-white/10"
      >
        Open Section
      </button>
    </div>
  );
}

function jumpToIssue(issue: CopilotIssue) {
  if (typeof window === "undefined") return;

  const section = String(issue?.section || "").trim();
  const slug = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  window.dispatchEvent(
    new CustomEvent("opi:command-center-jump", {
      detail: {
        targetAnchor: slug ? `report-section-${slug}` : "report-findings",
      },
    }),
  );
}

export default function InspectionCopilotPanel({
  inspectionId,
  compact = false,
}: {
  inspectionId: string;
  compact?: boolean;
}) {
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadCopilot = useCallback(
    async (nextQuestion = "") => {
      if (!inspectionId) return;
      setLoading(true);
      setMessage("");

      try {
        const res = await fetch("/api/ai/inspection-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            inspectionId,
            inspection_id: inspectionId,
            question: nextQuestion,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setMessage(data?.error || "Inspection Copilot failed.");
          return;
        }

        setResult(data);
      } catch (error: any) {
        setMessage(error?.message || "Inspection Copilot failed.");
      } finally {
        setLoading(false);
      }
    },
    [inspectionId]
  );

  useEffect(() => {
    loadCopilot();

    const interval = window.setInterval(() => {
      loadCopilot();
    }, 20000);

    return () => window.clearInterval(interval);
  }, [loadCopilot]);

  const topIssues = useMemo(() => {
    if (!result) return [];
    return [...(result.priorityIssues || []), ...(result.contradictions || [])].slice(0, compact ? 4 : 8);
  }, [result, compact]);

  async function askCopilot(nextQuestion?: string) {
    const cleanQuestion = String(nextQuestion ?? question).trim();
    if (!cleanQuestion && result) return;
    setQuestion(cleanQuestion);
    await loadCopilot(cleanQuestion);
  }

  async function reviewMyInspection() {
    setQuestion("Review my inspection before I leave. Give me a prioritized punch list of missing systems, photos, equipment data plates, limitations, weak findings, and contradictions.");
    await loadCopilot(
      "Review my inspection before I leave. Give me a prioritized punch list of missing systems, photos, equipment data plates, limitations, weak findings, and contradictions.",
    );
  }

  const score = result?.score ?? 0;

  return (
    <section className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-300">
            Inspection Copilot
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Live AI Inspector Assistant
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Watches the full inspection for missing items, contradictions, related findings, confidence changes, and publish readiness.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reviewMyInspection}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Reviewing..." : "Review My Inspection"}
          </button>

          <button
            type="button"
            onClick={() => loadCopilot(question)}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Checking..." : "Refresh Copilot"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-4 ${result ? scoreTone(score) : "border-slate-700 bg-[#020817]/70 text-slate-300"}`}>
          <p className="text-xs font-black uppercase tracking-wide opacity-80">
            Copilot Score
          </p>
          <p className="mt-1 text-3xl font-black">
            {result ? score : "—"}
            {result && <span className="text-base opacity-80"> / 100</span>}
          </p>
          <p className="mt-1 text-xs font-bold opacity-90">
            {result?.status || "Monitoring"}
          </p>
        </div>

        <SmallStat label="AI Confidence" value={result ? `${result.confidence}%` : "—"} />
        <SmallStat label="Findings" value={result?.findingCount ?? "—"} />
        <SmallStat label="Equipment" value={result?.equipmentCount ?? "—"} />
      </div>

      <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Ask Copilot
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickQuestions().map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => askCopilot(item)}
              disabled={loading || !inspectionId}
              className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-black text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void askCopilot();
              }
            }}
            placeholder="Ask: what still needs inspected, any contradictions, is it ready to publish..."
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-black px-3 py-3 text-sm text-white outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={() => askCopilot()}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-slate-200 disabled:opacity-60"
          >
            Ask
          </button>
        </div>

        {result?.answer && (
          <div className="mt-3 whitespace-pre-line rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm leading-6 text-indigo-100">
            {result.answer}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
                Things To Review
              </h3>
              <span className="rounded-full border border-slate-600 bg-black/30 px-2 py-1 text-xs font-black text-slate-300">
                {topIssues.length}
              </span>
            </div>

            {topIssues.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                No major copilot review items detected.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {topIssues.map((item) => (
                  <IssueCard key={item.id} issue={item} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">
                Missing Systems
              </h3>
              <span className="rounded-full border border-slate-600 bg-black/30 px-2 py-1 text-xs font-black text-slate-300">
                {result.missingSystems.length}
              </span>
            </div>

            {result.missingSystems.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                Core systems appear represented in saved data.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.missingSystems.map((system) => (
                  <span
                    key={system}
                    className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs font-black text-yellow-200"
                  >
                    {system}
                  </span>
                ))}
              </div>
            )}

            <h3 className="mt-5 text-sm font-black uppercase tracking-wide text-slate-400">
              Suggestions
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              {result.suggestions.map((item, index) => (
                <li key={index}>✓ {item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result?.relatedFindings?.length ? (
        <div className="mt-5 rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-cyan-300">
            Possible Related Findings
          </h3>

          <div className="mt-3 grid gap-3">
            {result.relatedFindings.map((cluster) => (
              <div key={cluster.id} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-black text-white">{cluster.title}</p>
                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-black text-cyan-200">
                    {cluster.confidence}% confidence
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{cluster.explanation}</p>
                <div className="mt-3 grid gap-2">
                  {cluster.findings.map((finding, index) => (
                    <div key={`${cluster.id}-${finding.id || index}`} className="rounded-lg border border-slate-700 bg-black/30 px-3 py-2 text-xs text-slate-300">
                      <span className="font-black text-cyan-200">{finding.section || "General"}</span>
                      {" — "}
                      {finding.title}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-bold leading-5 text-cyan-100">
                  {cluster.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
