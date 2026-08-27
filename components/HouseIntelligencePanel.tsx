"use client";

export type HouseMemoryFact = {
  system: string;
  label: string;
  value: string;
  confidence?: number;
  source?: string;
  evidence?: string[];
};

export type HouseMemorySnapshot = {
  inspectionId: string | number;
  propertyAddress?: string;
  propertyType?: string;
  yearBuilt?: string | number;
  facts?: HouseMemoryFact[];
  reminders?: string[];
  summary?: string;
};

function confidenceTone(value?: number) {
  const confidence = Number(value || 0);

  if (confidence >= 90) return "text-emerald-300";
  if (confidence >= 75) return "text-yellow-300";
  return "text-orange-300";
}

function systemComplete(memory: HouseMemorySnapshot | null, system: string) {
  return Boolean(
    memory?.facts?.some(
      (fact) => String(fact.system || "").toLowerCase() === system.toLowerCase()
    )
  );
}

function groupFacts(facts?: HouseMemoryFact[]) {
  return (facts || []).reduce<Record<string, HouseMemoryFact[]>>((acc, fact) => {
    const system = fact.system || "General";
    if (!acc[system]) acc[system] = [];
    acc[system].push(fact);
    return acc;
  }, {});
}

export default function HouseIntelligencePanel({
  memory,
  loading = false,
  onRefresh,
}: {
  memory: HouseMemorySnapshot | null;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const facts = memory?.facts || [];
  const reminders = memory?.reminders || [];
  const groupedFacts = groupFacts(facts);

  const coreSystems = [
    "Exterior",
    "Roof",
    "Heating",
    "Cooling",
    "Plumbing",
    "Electrical",
    "Attic, Insulation & Ventilation",
    "Basement, Foundation, Crawlspace & Structure",
  ];

  const completeCount = coreSystems.filter((system) =>
    systemComplete(memory, system)
  ).length;

  const progress = Math.round((completeCount / coreSystems.length) * 100);

  const averageConfidence =
    facts.length > 0
      ? Math.round(
          facts.reduce((sum, fact) => sum + Number(fact.confidence || 75), 0) /
            facts.length
        )
      : 0;

  return (
    <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            House Intelligence
          </p>

          <h2 className="mt-1 text-xl font-semibold text-[var(--fl-text)]">
            Inspection Memory
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">
            Live property facts learned from findings, equipment scans, photos,
            and report review.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-xl border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        )}
      </div>

      {!memory ? (
        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
          House Memory will appear after this inspection has findings or equipment
          records. Refresh after scanning equipment or saving findings.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Coverage
              </p>
              <p className="mt-1 text-2xl font-semibold text-cyan-300">
                {progress}%
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--fl-surface-2)]">
                <div
                  className="h-full bg-cyan-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Facts
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
                {facts.length}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                AI Confidence
              </p>
              <p className={`mt-1 text-2xl font-semibold ${confidenceTone(averageConfidence)}`}>
                {averageConfidence || "—"}%
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Systems Learned
            </p>

            <div className="mt-3 grid gap-2">
              {coreSystems.map((system) => {
                const complete = systemComplete(memory, system);

                return (
                  <div
                    key={system}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      complete
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]"
                    }`}
                  >
                    {complete ? "✓" : "○"} {system}
                  </div>
                );
              })}
            </div>
          </div>

          {Object.keys(groupedFacts).length > 0 && (
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Known Property Facts
              </p>

              <div className="mt-3 space-y-3">
                {Object.entries(groupedFacts).map(([system, items]) => (
                  <div key={system} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
                    <p className="text-sm font-semibold text-cyan-300">{system}</p>

                    <div className="mt-2 space-y-2">
                      {items.slice(0, 4).map((fact, index) => (
                        <div key={`${system}-${fact.label}-${index}`}>
                          <p className="text-xs font-semibold text-[var(--fl-text)]">
                            {fact.label}
                          </p>
                          <p className="text-xs leading-5 text-[var(--fl-muted)]">
                            {fact.value}
                          </p>
                          {fact.confidence !== undefined && (
                            <p className={`mt-1 text-[11px] font-bold ${confidenceTone(fact.confidence)}`}>
                              {fact.confidence}% confidence
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reminders.length > 0 && (
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-300">
                AI Reminders
              </p>

              <ul className="mt-2 space-y-1">
                {reminders.slice(0, 8).map((reminder, index) => (
                  <li key={index} className="text-xs leading-5 text-yellow-100">
                    ⚠ {reminder}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
