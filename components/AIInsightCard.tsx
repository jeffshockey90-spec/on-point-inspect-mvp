import React from "react";

export type AIInsight = {
  title?: string;
  confidence?: number;
  risk?: "Low" | "Medium" | "High";
  reasoning?: string[];
  suggestions?: string[];
  evidence?: string[];
  learning?: string[];
  version?: string;
};

export default function AIInsightCard({
  insight,
}: {
  insight: AIInsight;
}) {
  const confidence = Math.max(0, Math.min(100, insight.confidence ?? 0));

  const riskColor =
    insight.risk === "High"
      ? "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]"
      : insight.risk === "Medium"
      ? "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]"
      : "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]";

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items?: string[];
  }) =>
    items && items.length ? (
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          {title}
        </h3>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-[var(--fl-text)]">
              ✓ {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-[var(--fl-surface-2)] p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-info-text)]">
            AI Intelligence
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--fl-text)]">
            {insight.title || "Inspection Brain"}
          </h2>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold text-[var(--fl-info-text)]">
            {confidence}%
          </div>
          <div className="text-xs uppercase text-[var(--fl-muted)]">
            Confidence
          </div>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${riskColor}`}>
        Risk Level: {insight.risk || "Low"}
      </div>

      <Section title="Reasoning" items={insight.reasoning} />
      <Section title="Inspector Suggestions" items={insight.suggestions} />
      <Section title="Evidence Used" items={insight.evidence} />
      <Section title="Learning" items={insight.learning} />

      <div className="mt-5 border-t border-[var(--fl-line)] pt-3 text-xs text-[var(--fl-faint)]">
        AI Version: {insight.version || "Inspection Brain v2"}
      </div>
    </div>
  );
}
