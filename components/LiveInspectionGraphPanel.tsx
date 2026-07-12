"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InspectionGraphResult } from "../lib/ai/InspectionGraph";

function scoreTone(score: number) {
  if (score >= 85) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
  if (score >= 65) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  return "border-red-500/50 bg-red-500/10 text-red-100";
}

export default function LiveInspectionGraphPanel({
  inspectionId,
  currentSection,
  compact = false,
}: {
  inspectionId: string;
  currentSection?: string;
  compact?: boolean;
}) {
  const inFlight = useRef(false);
  const [graph, setGraph] = useState<InspectionGraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!compact);

  const loadGraph = useCallback(async () => {
    if (!inspectionId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/ai/inspection-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ inspectionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.graph) setGraph(payload.graph);
    } catch {
      // Keep the field workflow responsive if graph refresh is unavailable.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadGraph();
    const interval = window.setInterval(loadGraph, 20000);
    const refresh = () => loadGraph();
    window.addEventListener("opi:findings-changed", refresh);
    window.addEventListener("opi:section-limitations-changed", refresh);
    window.addEventListener("opi:offline-sync-complete", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("opi:findings-changed", refresh);
      window.removeEventListener("opi:section-limitations-changed", refresh);
      window.removeEventListener("opi:offline-sync-complete", refresh);
    };
  }, [loadGraph]);

  const current = useMemo(
    () => graph?.sections.find((section) => section.section === currentSection) || null,
    [graph, currentSection],
  );

  if (!graph && !loading) return null;

  return (
    <section className={`rounded-2xl border p-4 ${scoreTone(graph?.score || 0)}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
            House Digital Twin
          </p>
          <h2 className="mt-1 text-lg font-black text-white">
            {loading && !graph ? "Building inspection graph…" : `${graph?.score || 0}% Inspection Coverage`}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {graph?.summary || "Connecting findings, equipment, evidence, limitations, and section requirements."}
          </p>
        </div>
        <span className="rounded-full border border-current/30 px-3 py-2 text-xs font-black">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      {current && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-white">{current.section}</p>
            <span className="text-sm font-black">{current.score}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${current.score}%` }} />
          </div>
          {current.missingRequirements.length > 0 && (
            <p className="mt-2 text-xs text-yellow-100">
              Missing: {current.missingRequirements.join(", ")}
            </p>
          )}
        </div>
      )}

      {open && graph && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {graph.sections.map((section) => (
              <div key={section.section} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-white">{section.section}</p>
                  <span className="text-xs font-black">{section.score}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-teal-400" style={{ width: `${section.score}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-slate-300">
                  {section.findingCount} findings · {section.photoCount} photos · {section.equipmentCount} equipment
                </p>
                {section.missingRequirements.length > 0 && (
                  <p className="mt-2 line-clamp-3 text-[11px] text-yellow-100">
                    Verify: {section.missingRequirements.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {graph.relationships.length > 0 && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-purple-200">
                Connected Intelligence
              </p>
              <div className="mt-3 space-y-2">
                {graph.relationships.slice(0, compact ? 3 : 6).map((relationship) => (
                  <div key={relationship.id} className="rounded-lg bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-white">{relationship.title}</p>
                      <span className="text-[11px] font-black text-purple-200">
                        {Math.round(relationship.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">{relationship.explanation}</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-purple-100">{relationship.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
