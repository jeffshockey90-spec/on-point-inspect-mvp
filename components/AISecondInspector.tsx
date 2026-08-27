"use client";

type AISuggestion = {
  id: string;
  source: "defect" | "equipment" | "note" | "voice";
  title: string;
  section?: string;
  severity?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string[];
  recommendation?: string;
  createdAt?: number;
};

function confidenceTone(confidence: number) {
  if (confidence >= 90) {
    return {
      badge: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
      label: "High Confidence",
      bar: "bg-emerald-400",
    };
  }

  if (confidence >= 75) {
    return {
      badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
      label: "Moderate Confidence",
      bar: "bg-yellow-400",
    };
  }

  return {
    badge: "border-orange-500/50 bg-orange-500/10 text-orange-300",
    label: "Needs Review",
    bar: "bg-orange-400",
  };
}

function sourceLabel(source: AISuggestion["source"]) {
  if (source === "equipment") return "Equipment AI";
  if (source === "defect") return "Photo AI";
  if (source === "voice") return "Voice AI";
  return "Note AI";
}

function sourceHelper(source: AISuggestion["source"]) {
  if (source === "equipment") {
    return "Based on equipment photos, data plate details, age, equipment type, and service-life logic.";
  }

  if (source === "defect") {
    return "Based on visible photo evidence, inspector note, selected section, and defect-recognition analysis.";
  }

  if (source === "voice") {
    return "Based on the dictated inspector note. Review wording before saving.";
  }

  return "Based on the quick inspector note. AI expanded it into a report-ready finding.";
}

function severityTone(severity?: string) {
  const clean = String(severity || "").toLowerCase();

  if (clean.includes("major") || clean.includes("safety")) {
    return "border-red-500/50 bg-red-500/10 text-red-300";
  }

  if (clean.includes("repair")) {
    return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  }

  if (clean.includes("maintenance") || clean.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
}

function emptyState() {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
      <p className="font-bold text-[var(--fl-text)]">Waiting for inspection activity.</p>
      <p className="mt-2">
        Add photos, scan equipment, dictate a finding, or generate from a note.
        The AI will summarize what it found, explain why it matters, and suggest
        next steps here.
      </p>

      <div className="mt-4 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">
          What AI will look for
        </p>

        <ul className="mt-2 space-y-1 text-xs leading-5 text-purple-100">
          <li>✓ Possible reportable defects</li>
          <li>✓ Best report section and severity</li>
          <li>✓ Missing implication or recommendation details</li>
          <li>✓ Equipment age, condition, and service-life concerns</li>
          <li>✓ Items the inspector should verify before saving</li>
        </ul>
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-black/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {title}
      </p>
      <div className="mt-2 text-sm leading-6 text-[var(--fl-text)]">{children}</div>
    </div>
  );
}

export default function AISecondInspector({
  suggestions,
  onAccept,
  onIgnore,
  onClear,
}: {
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onIgnore: (suggestionId: string) => void;
  onClear: () => void;
}) {
  const activeSuggestion = suggestions[0];

  return (
    <section className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-purple-500/40 bg-purple-950/20 p-4 shadow-xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-300">
            AI Second Inspector
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-[var(--fl-text)]">
            Live Review
          </h2>

          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
            Real-time AI review for field photos, equipment scans, dictated notes,
            generated findings, and report wording. Inspector has final say.
          </p>
        </div>

        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-muted)] transition hover:bg-[var(--fl-raised)]"
          >
            Clear
          </button>
        )}
      </div>

      {!activeSuggestion ? (
        emptyState()
      ) : (
        <div className="space-y-4">
          {(() => {
            const confidence = Math.max(
              0,
              Math.min(100, Number(activeSuggestion.confidence || 0))
            );
            const tone = confidenceTone(confidence);

            return (
              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">
                      Current AI Review
                    </p>

                    <h3 className="mt-1 text-xl font-semibold text-[var(--fl-text)]">
                      {activeSuggestion.title}
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                      {sourceHelper(activeSuggestion.source)}
                    </p>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}>
                    {sourceLabel(activeSuggestion.source)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-xl border p-3 ${tone.badge}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      Confidence
                    </p>
                    <p className="mt-1 text-3xl font-semibold">
                      {confidence || "—"}%
                    </p>
                    <p className="mt-1 text-xs font-bold opacity-90">
                      {confidence ? tone.label : "Pending Review"}
                    </p>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
                      <div
                        className={`h-full ${tone.bar}`}
                        style={{ width: `${confidence || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className={`rounded-xl border p-3 ${severityTone(activeSuggestion.severity)}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      AI Classification
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {activeSuggestion.section || "Section pending"}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {activeSuggestion.severity || "Severity pending"}
                    </p>
                  </div>
                </div>

                {activeSuggestion.summary && (
                  <DetailBlock title="AI Summary">
                    {activeSuggestion.summary}
                  </DetailBlock>
                )}

                {activeSuggestion.reasoning?.length ? (
                  <DetailBlock title="Why AI flagged this">
                    <ul className="space-y-1">
                      {activeSuggestion.reasoning.map((item, index) => (
                        <li key={index}>✓ {item}</li>
                      ))}
                    </ul>
                  </DetailBlock>
                ) : null}

                <DetailBlock title="Inspector verification">
                  <ul className="space-y-1">
                    <li>✓ Confirm the visible condition matches the AI wording.</li>
                    <li>✓ Confirm the selected section is correct for the component shown.</li>
                    <li>✓ Confirm severity is not overstated for the actual condition.</li>
                    <li>✓ Add location details if needed before saving.</li>
                  </ul>
                </DetailBlock>

                {activeSuggestion.recommendation && (
                  <DetailBlock title="Suggested recommendation">
                    {activeSuggestion.recommendation}
                  </DetailBlock>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onAccept(activeSuggestion)}
                    className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-400"
                  >
                    Accept Into Finding
                  </button>

                  <button
                    type="button"
                    onClick={() => onIgnore(activeSuggestion.id)}
                    className="rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-muted)] transition hover:bg-[var(--fl-raised)]"
                  >
                    Ignore This
                  </button>
                </div>
              </div>
            );
          })()}

          {suggestions.length > 1 && (
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Other AI Suggestions
              </p>

              <div className="mt-3 space-y-2">
                {suggestions.slice(1).map((suggestion) => {
                  const confidence = Math.max(
                    0,
                    Math.min(100, Number(suggestion.confidence || 0))
                  );
                  const tone = confidenceTone(confidence);

                  return (
                    <div
                      key={suggestion.id}
                      className="rounded-xl border border-[var(--fl-line)] bg-black/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--fl-text)]">
                            {suggestion.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--fl-muted)]">
                            {[suggestion.section, suggestion.severity]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>

                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.badge}`}>
                          {confidence || "—"}%
                        </span>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onAccept(suggestion)}
                          className="flex-1 rounded-lg bg-purple-500 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-400"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onIgnore(suggestion.id)}
                          className="flex-1 rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100">
            <p className="font-semibold uppercase tracking-wide text-cyan-300">
              Learning note
            </p>
            <p className="mt-1">
              Accepting, editing, or ignoring suggestions can later be logged so
              the AI learns inspector preferences while keeping technical
              inspection facts fixed.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export type { AISuggestion };
