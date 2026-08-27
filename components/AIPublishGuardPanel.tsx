"use client";

import { useCallback, useMemo, useState } from "react";
import { dispatchInspectionDataChanged } from "../lib/inspectionEvents";

type PublishGuardIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  section?: string;
  reason: string;
  recommendation: string;
  blocking?: boolean;
  confidence?: number;
  priority?: "blocking" | "safety" | "recommended" | "improvement";
  liabilityRisk?: "high" | "medium" | "low";
  expectedEvidence?: string[];
};

type CompletenessSection = {
  section?: string;
  score?: number;
  complete?: boolean;
  issueCount?: number;
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
  completeness?: { sections?: CompletenessSection[] };
};

function slugify(value?: string) {
  return String(value || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scoreTone(score?: number) {
  const value = Number(score || 0);
  if (value >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (value >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  return "border-red-500/50 bg-red-500/10 text-red-300";
}

function issueTone(severity?: string) {
  if (severity === "critical") return "border-red-500/50 bg-red-500/10 text-red-100";
  if (severity === "warning") return "border-amber-500/50 bg-amber-500/10 text-amber-100";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function recommendationTone(value?: string) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("ready") && !clean.includes("not")) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (clean.includes("do not")) return "border-red-500/50 bg-red-500/10 text-red-300";
  return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
}

function confidenceTone(value = 0) {
  if (value >= 95) return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (value >= 80) return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  return "border-red-400/40 bg-red-400/10 text-red-100";
}

function priorityLabel(issue: PublishGuardIssue) {
  if (issue.priority === "blocking" || issue.blocking) return "Publish Blocking";
  if (issue.priority === "safety") return "Safety";
  if (issue.priority === "improvement") return "Improvement";
  return "Recommended";
}

function findAndScrollToSection(section?: string) {
  if (typeof window === "undefined") return false;
  const clean = String(section || "").trim();
  if (!clean) return false;
  const slug = slugify(clean);
  const selectors = [
    `[data-section-name="${clean.replace(/"/g, '\\"')}"]`,
    `[data-section="${clean.replace(/"/g, '\\"')}"]`,
    `#section-${slug}`,
    `#${slug}`,
    `[data-command-target="${slug}"]`,
  ];
  for (const selector of selectors) {
    const target = document.querySelector(selector) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus?.({ preventScroll: true });
      return true;
    }
  }
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,button,[role='button']"));
  const heading = headings.find((node) => String(node.textContent || "").trim().toLowerCase() === clean.toLowerCase()) as HTMLElement | undefined;
  if (heading) {
    heading.scrollIntoView({ behavior: "smooth", block: "center" });
    heading.click?.();
    return true;
  }
  return false;
}

function IssueCard({
  issue,
  inspectionId,
  resolved,
  onResolved,
}: {
  issue: PublishGuardIssue;
  inspectionId: string;
  resolved: boolean;
  onResolved: (issueId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const confidence = Math.max(0, Math.min(100, Number(issue.confidence ?? (issue.severity === "critical" ? 97 : issue.severity === "warning" ? 90 : 82))));
  const evidence = issue.expectedEvidence?.length ? issue.expectedEvidence : [issue.recommendation];

  const openSection = () => {
    const found = findAndScrollToSection(issue.section);
    window.dispatchEvent(new CustomEvent("opi:publish-guard-action", { detail: { action: "open-section", inspectionId, issue, found } }));
  };

  const openCamera = () => {
    window.dispatchEvent(new CustomEvent("opi:open-ai-camera", { detail: { inspectionId, section: issue.section, issueId: issue.id, title: issue.title } }));
    const cameraTarget = document.querySelector('[data-command-target="ai-camera"], #ai-camera, [data-command-target="field-tool"]') as HTMLElement | null;
    cameraTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
    cameraTarget?.click?.();
  };

  const startFinding = () => {
    window.dispatchEvent(new CustomEvent("opi:create-finding-from-guard", { detail: { inspectionId, section: issue.section, title: issue.title, observation: issue.reason, recommendation: issue.recommendation } }));
    openSection();
  };

  const addLimitation = () => {
    window.dispatchEvent(new CustomEvent("opi:create-limitation-from-guard", { detail: { inspectionId, section: issue.section, title: issue.title, reason: issue.reason } }));
    openSection();
  };

  const markReviewed = () => {
    onResolved(issue.id);
    dispatchInspectionDataChanged({ inspectionId, section: issue.section, source: "publish-guard", types: ["publish-guard-review"] });
  };

  return (
    <article className={`overflow-hidden rounded-xl border transition ${resolved ? "border-emerald-500/40 bg-emerald-500/10 opacity-75" : issueTone(issue.severity)}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{resolved ? "✓ " : ""}{issue.title}</span>
            <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{priorityLabel(issue)}</span>
            {issue.section && <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold">{issue.section}</span>}
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-90">{issue.reason}</p>
        </div>
        <span className="shrink-0 text-lg opacity-80">{open ? "⌃" : "⌄"}</span>
      </button>

      {open && (
        <div className="border-t border-current/20 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`rounded-lg border p-3 ${confidenceTone(confidence)}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">AI Confidence</p>
              <p className="mt-1 text-xl font-semibold">{confidence}%</p>
            </div>
            <div className="rounded-lg border border-current/20 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Liability Risk</p>
              <p className="mt-1 text-base font-semibold uppercase">{issue.liabilityRisk || (issue.severity === "critical" ? "high" : issue.severity === "warning" ? "medium" : "low")}</p>
            </div>
            <div className="rounded-lg border border-current/20 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Status</p>
              <p className="mt-1 text-base font-semibold">{resolved ? "Reviewed" : issue.blocking ? "Blocking" : "Needs Review"}</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-current/20 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Expected evidence</p>
            <ul className="mt-2 space-y-1 text-xs leading-5">
              {evidence.map((item, index) => <li key={`${issue.id}-evidence-${index}`}>☐ {item}</li>)}
            </ul>
          </div>

          <p className="mt-3 text-xs font-bold leading-5">Why it matters: {issue.recommendation}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" onClick={openSection} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">Open Section</button>
            <button type="button" onClick={openCamera} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20">Open AI Camera</button>
            <button type="button" onClick={startFinding} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/20">Add Finding</button>
            <button type="button" onClick={addLimitation} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/20">Add Limitation</button>
            <button type="button" onClick={markReviewed} disabled={resolved} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50">{resolved ? "Reviewed" : "Mark Reviewed"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#59626f]/30 bg-slate-500/10 px-3 py-2 text-xs font-semibold text-[#e8ecf3] hover:bg-slate-500/20">Collapse</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function AIPublishGuardPanel({ inspectionId }: { inspectionId: string }) {
  const [result, setResult] = useState<PublishGuardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);

  const runGuard = useCallback(async () => {
    if (!inspectionId || loading) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/ai/publish-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId, inspection_id: inspectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "AI Publish Guard failed.");
        return;
      }
      setResult(data);
      setResolvedIds([]);
      setMessage(data.blocked ? "AI Publish Guard found items that should be resolved before publishing." : "AI Publish Guard completed.");
    } catch (error: any) {
      setMessage(error?.message || "AI Publish Guard failed.");
    } finally {
      setLoading(false);
    }
  }, [inspectionId, loading]);

  const activeIssues = useMemo(() => (result?.issues || []).filter((issue) => !resolvedIds.includes(issue.id)), [result, resolvedIds]);
  const displayedIssues = activeIssues.slice(0, 12);
  const effectiveScore = result ? Math.min(100, result.score + resolvedIds.length * 2) : null;
  const groupedSections = useMemo(() => {
    const rows = new Map<string, { issueCount: number; critical: number }>();
    for (const issue of activeIssues) {
      const section = issue.section || "General";
      const current = rows.get(section) || { issueCount: 0, critical: 0 };
      current.issueCount += 1;
      if (issue.severity === "critical") current.critical += 1;
      rows.set(section, current);
    }
    return Array.from(rows.entries()).sort((a, b) => b[1].critical - a[1].critical || b[1].issueCount - a[1].issueCount);
  }, [activeIssues]);

  return (
    <section className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-300">AI Publish Guard</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">AI Quality Control Center</h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">Finds missing safety evidence, incomplete systems, contradictions, missing media, and liability-sensitive documentation—then gives you one-tap ways to resolve each item.</p>
        </div>
        <button type="button" onClick={runGuard} disabled={loading || !inspectionId} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Checking..." : result ? "Run Again" : "Run Publish Guard"}</button>
      </div>

      {message && <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className={`rounded-xl border p-4 ${effectiveScore === null ? "border-[#232b38] bg-[#131923] text-[#8a93a3]" : scoreTone(effectiveScore)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Inspection Completeness</p>
          <p className="mt-1 text-3xl font-semibold">{effectiveScore === null ? "—" : effectiveScore}{effectiveScore !== null && <span className="text-base opacity-80"> / 100</span>}</p>
          {result && <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-current transition-all" style={{ width: `${effectiveScore}%` }} /></div>}
        </div>
        <div className={`rounded-xl border p-4 ${recommendationTone(result?.recommendation)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Recommendation</p>
          <p className="mt-1 text-xl font-semibold">{activeIssues.length === 0 && result ? "Ready" : result?.recommendation || "Not checked yet"}</p>
          {result && <p className="mt-2 text-xs font-bold opacity-80">{activeIssues.length} unresolved · {resolvedIds.length} reviewed</p>}
        </div>
        <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Reviewed</p>
          <p className="mt-2 text-sm text-[#8a93a3]">Findings: <span className="font-semibold text-white">{result?.findingCount ?? "—"}</span></p>
          <p className="mt-1 text-sm text-[#8a93a3]">Equipment: <span className="font-semibold text-white">{result?.equipmentCount ?? "—"}</span></p>
          <p className="mt-1 text-sm text-[#8a93a3]">Media: <span className="font-semibold text-white">{result?.photoCount ?? "—"}</span></p>
        </div>
      </div>

      {result && (
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.4fr]">
          <aside className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">System Status</h3>
            <div className="mt-3 space-y-2">
              {groupedSections.length === 0 ? <p className="text-sm font-bold text-emerald-300">✓ All reviewed systems are clear.</p> : groupedSections.map(([section, meta]) => (
                <button key={section} type="button" onClick={() => findAndScrollToSection(section)} className="flex w-full items-center justify-between rounded-lg border border-[#232b38] bg-black/20 px-3 py-2 text-left hover:bg-white/5">
                  <span className="text-sm font-semibold text-white">{section}</span>
                  <span className={meta.critical ? "text-xs font-semibold text-red-300" : "text-xs font-semibold text-amber-300"}>{meta.critical ? "●" : "⚠"} {meta.issueCount}</span>
                </button>
              ))}
            </div>
            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">Final Suggestions</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#8a93a3]">{(result.suggestions?.length ? result.suggestions : ["Perform final inspector review before publishing."]).map((item, index) => <li key={index}>✓ {item}</li>)}</ul>
          </aside>

          <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">Actionable Publish Guard Issues</h3>
              <span className="rounded-full border border-[#232b38] bg-black/30 px-2 py-1 text-xs font-semibold text-[#8a93a3]">{activeIssues.length}</span>
            </div>
            {displayedIssues.length === 0 ? <p className="mt-3 text-sm font-bold text-emerald-300">No unresolved publish guard issues detected.</p> : <div className="mt-3 space-y-3">{displayedIssues.map((issue) => <IssueCard key={issue.id} issue={issue} inspectionId={inspectionId} resolved={resolvedIds.includes(issue.id)} onResolved={(id) => setResolvedIds((current) => current.includes(id) ? current : [...current, id])} />)}</div>}
            {activeIssues.length > displayedIssues.length && <p className="mt-3 text-xs font-bold text-[#8a93a3]">Showing the first {displayedIssues.length} of {activeIssues.length} unresolved issues.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
