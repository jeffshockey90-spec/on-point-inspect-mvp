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
      ? "border-red-500/40 bg-red-500/10 text-red-300"
      : insight.risk === "Medium"
      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items?: string[];
  }) =>
    items && items.length ? (
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8a93a3]">
          {title}
        </h3>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-[#e8ecf3]">
              ✓ {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-[#131923] p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            AI Intelligence
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {insight.title || "Inspection Brain"}
          </h2>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold text-cyan-300">
            {confidence}%
          </div>
          <div className="text-xs uppercase text-[#8a93a3]">
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

      <div className="mt-5 border-t border-[#232b38] pt-3 text-xs text-[#59626f]">
        AI Version: {insight.version || "Inspection Brain v2"}
      </div>
    </div>
  );
}
