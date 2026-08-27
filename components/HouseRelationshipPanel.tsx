"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RelationshipSeverity = "info" | "monitor" | "concern" | "critical";

type HouseRelationship = {
  id: string;
  title: string;
  category: string;
  severity: RelationshipSeverity;
  confidence: number;
  findings: Array<{
    id?: string | number;
    title: string;
    section?: string;
    severity?: string;
    observation?: string;
  }>;
  explanation: string;
  recommendation: string;
  inspectorNote: string;
};

type HouseRelationshipResult = {
  relationshipCount: number;
  highestConfidence: number;
  relationships: HouseRelationship[];
  summary: string;
  suggestions: string[];
};

function severityTone(severity?: RelationshipSeverity) {
  if (severity === "critical") {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }

  if (severity === "concern") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-200";
  }

  if (severity === "monitor") {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function confidenceTone(confidence: number) {
  if (confidence >= 90) return "text-emerald-300";
  if (confidence >= 75) return "text-yellow-300";
  return "text-orange-300";
}

function categoryLabel(category: string) {
  const clean = String(category || "").toLowerCase();

  if (clean === "moisture") return "Moisture Path";
  if (clean === "drainage") return "Drainage / Foundation";
  if (clean === "hvac") return "HVAC Performance";
  if (clean === "electrical") return "Electrical Safety";
  if (clean === "structure") return "Structural";
  if (clean === "safety") return "Safety";
  return "Maintenance";
}

function RelationshipCard({ relationship }: { relationship: HouseRelationship }) {
  return (
    <div className={`rounded-2xl border p-4 ${severityTone(relationship.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            {categoryLabel(relationship.category)}
          </p>

          <h3 className="mt-1 text-lg font-semibold text-[var(--fl-text)]">
            {relationship.title}
          </h3>
        </div>

        <span className={`rounded-full border border-current/30 bg-black/20 px-3 py-1 text-xs font-semibold ${confidenceTone(relationship.confidence)}`}>
          {relationship.confidence}% confidence
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 opacity-95">
        {relationship.explanation}
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Related Findings
        </p>

        <div className="mt-3 space-y-2">
          {relationship.findings.map((finding, index) => (
            <div
              key={`${relationship.id}-${finding.id || index}`}
              className="rounded-xl border border-white/10 bg-black/25 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--fl-text)]">
                  {index + 1}. {finding.title}
                </p>

                {finding.section && (
                  <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-semibold opacity-90">
                    {finding.section}
                  </span>
                )}
              </div>

              {finding.severity && (
                <p className="mt-1 text-xs font-bold opacity-80">
                  {finding.severity}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            Recommendation
          </p>
          <p className="mt-2 text-sm leading-6">{relationship.recommendation}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            Inspector Note
          </p>
          <p className="mt-2 text-sm leading-6">{relationship.inspectorNote}</p>
        </div>
      </div>
    </div>
  );
}

function usePanelActive() {
  const rootRef = useRef<HTMLElement | null>(null);
  const isIntersecting = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(document.visibilityState === "visible");
      return;
    }

    const updateVisibility = () => {
      setActive(isIntersecting.current && document.visibilityState === "visible");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting.current = entry.isIntersecting;
        setActive(entry.isIntersecting && document.visibilityState === "visible");
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );

    observer.observe(node);
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return { rootRef, active };
}

export default function HouseRelationshipPanel({
  inspectionId,
  compact = false,
}: {
  inspectionId: string;
  compact?: boolean;
}) {
  const { rootRef, active } = usePanelActive();
  const inFlight = useRef(false);
  const [result, setResult] = useState<HouseRelationshipResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadRelationships = useCallback(async () => {
    if (!inspectionId || !active || inFlight.current) return;

    inFlight.current = true;
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai/house-relationships", {
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
        setMessage(data?.error || "House Relationship Engine failed.");
        return;
      }

      setResult(data);
    } catch (error: any) {
      setMessage(error?.message || "House Relationship Engine failed.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [inspectionId, active]);

  useEffect(() => {
    if (!active) return;
    loadRelationships();

    const interval = window.setInterval(() => {
      loadRelationships();
    }, 25000);

    return () => window.clearInterval(interval);
  }, [loadRelationships]);

  const relationships = useMemo(() => {
    const items = result?.relationships || [];
    return compact ? items.slice(0, 3) : items;
  }, [result, compact]);

  return (
    <section ref={rootRef} className="rounded-2xl border border-fuchsia-500/40 bg-fuchsia-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">
            House Relationship Engine
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            Connected Finding Intelligence
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
            Looks across the whole inspection for findings that may be related,
            such as roof leaks connected to attic stains, drainage connected to
            basement moisture, or HVAC age connected to performance concerns.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRelationships}
          disabled={loading || !inspectionId}
          className="rounded-xl bg-fuchsia-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Checking..." : "Refresh Relationships"}
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Relationships
          </p>
          <p className="mt-1 text-3xl font-semibold text-[var(--fl-text)]">
            {result?.relationshipCount ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Highest Confidence
          </p>
          <p className={`mt-1 text-3xl font-semibold ${confidenceTone(result?.highestConfidence || 0)}`}>
            {result ? `${result.highestConfidence}%` : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Status
          </p>
          <p className="mt-1 text-lg font-semibold text-fuchsia-200">
            {result?.relationshipCount ? "Review Suggested" : "Monitoring"}
          </p>
        </div>
      </div>

      {result?.summary && (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-7 text-[var(--fl-text)]">
          {result.summary}
        </div>
      )}

      {result?.suggestions?.length ? (
        <div className="mt-5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-300">
            AI Suggestions
          </p>

          <ul className="mt-3 space-y-2">
            {result.suggestions.map((suggestion, index) => (
              <li key={index} className="text-sm leading-6 text-yellow-100">
                ⚠ {suggestion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {!result ? (
          <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
            Relationship intelligence will appear after the inspection has enough
            findings or equipment records to compare.
          </div>
        ) : relationships.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-bold leading-6 text-emerald-300">
            No strong cross-finding relationships detected yet.
          </div>
        ) : (
          relationships.map((relationship) => (
            <RelationshipCard key={relationship.id} relationship={relationship} />
          ))
        )}
      </div>
    </section>
  );
}
