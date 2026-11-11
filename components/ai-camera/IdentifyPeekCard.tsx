"use client";

// Point-and-identify peek card. Shown over the live view after the inspector
// taps Identify. It LABELS what the camera is pointing at and proposes a
// severity, then lets the inspector adjust the severity, add context, and hand
// it off to the background draft — or dismiss it. It never writes to the report
// itself; "Send to draft" queues the same background pipeline every capture uses.

import { useState } from "react";
import type { IdentifyResult } from "../../lib/ai/identifyResult";
import { useSeverityConfig } from "../../lib/severity/useSeverityConfig";
import {
  severityOptions,
  severityBadgeStyle,
  severityLabel,
} from "../../lib/severity/severityConfig";

type Props = {
  previewUrl: string;
  result: IdentifyResult;
  busy?: boolean;
  error?: string;
  // When the identified component's section has system-info material fields,
  // offer a one-tap "add to section info" that ticks the matching checkboxes.
  canFillChecklist?: boolean;
  fillSectionLabel?: string;
  onFillChecklist?: () => Promise<{ written: number; values: string[] }>;
  onSend: (severity: string, context: string) => void;
  onDismiss: () => void;
};

export default function IdentifyPeekCard({
  previewUrl,
  result,
  busy,
  error,
  canFillChecklist,
  fillSectionLabel,
  onFillChecklist,
  onSend,
  onDismiss,
}: Props) {
  const config = useSeverityConfig();
  // Resolve the AI's canonical severity to THIS company's label so custom
  // (renamed/recolored) severities are what the inspector sees and picks from.
  const [severity, setSeverity] = useState<string>(() => severityLabel(config, result.severity));
  const [context, setContext] = useState("");
  const badge = severityBadgeStyle(config, severity);

  // "Add to section info" state (independent of the finding hand-off).
  const [fillState, setFillState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [fillSummary, setFillSummary] = useState<{ written: number; values: string[] }>({
    written: 0,
    values: [],
  });
  const [fillError, setFillError] = useState("");
  // A short, friendly name for the section ("Attic, Insulation & Ventilation" -> "Attic").
  const shortSection = (fillSectionLabel || "").split(/[,&]/)[0].trim() || "section";

  async function handleFill() {
    if (!onFillChecklist || fillState === "busy") return;
    setFillState("busy");
    setFillError("");
    try {
      const summary = await onFillChecklist();
      setFillSummary(summary);
      setFillState("done");
    } catch (err: any) {
      setFillError(err?.message || "Couldn't add that — try again.");
      setFillState("error");
    }
  }

  return (
    <div
      className="absolute inset-0 z-[57] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm [touch-action:manipulation] sm:items-center"
      onClick={() => {
        if (!busy) onDismiss();
      }}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-neutral-950 p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
            <span aria-hidden>🔎</span> Identified
          </p>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 disabled:opacity-40 [touch-action:manipulation]"
          >
            Dismiss ✕
          </button>
        </div>

        <div className="flex gap-3">
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-xl border border-white/15 object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight text-white">{result.label}</p>
            {result.componentType &&
              result.componentType.toLowerCase() !== result.label.toLowerCase() && (
                <p className="mt-0.5 text-xs text-white/60">{result.componentType}</p>
              )}
            <p className="mt-1 text-[11px] text-white/45">{result.section}</p>
          </div>
        </div>

        {result.hazard && result.hazardNote && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200">
            <span className="font-semibold">⚠ Known concern — </span>
            {result.hazardNote}
          </div>
        )}

        {canFillChecklist && onFillChecklist && (
          <div className="mt-3 rounded-xl border border-white/12 bg-white/[0.03] p-3">
            {fillState !== "done" ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleFill()}
                  disabled={busy || fillState === "busy"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition active:scale-[0.99] disabled:opacity-50 [touch-action:manipulation]"
                >
                  {fillState === "busy" ? "Reading…" : `➕ Add ${shortSection} system info`}
                </button>
                <p className="mt-1.5 text-center text-[11px] text-white/40">
                  Ticks this section's material boxes (e.g. insulation type) — fills only what's empty.
                </p>
                {fillState === "error" && fillError && (
                  <p className="mt-1.5 text-center text-[11px] font-semibold text-red-300">{fillError}</p>
                )}
              </>
            ) : fillSummary.values.length > 0 ? (
              <div className="text-xs">
                <p className="font-semibold text-emerald-300">
                  {fillSummary.written > 0
                    ? `✓ Added to ${shortSection} info`
                    : `Already on file in ${shortSection} info`}
                </p>
                <ul className="mt-1 space-y-0.5 text-white/70">
                  {fillSummary.values.map((value) => (
                    <li key={value}>• {value}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-white/60">Couldn&apos;t read a material to add here.</p>
            )}
          </div>
        )}

        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/50">
            Severity
          </label>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: badge.color, background: badge.background, border: `1px solid ${badge.border}` }}
            >
              {severity}
            </span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              disabled={busy}
              aria-label="Severity"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-neutral-900 px-2 py-2 text-xs text-white outline-none focus:border-cyan-400 disabled:opacity-60"
            >
              {severityOptions(config).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/50">
            Add context <span className="font-normal normal-case text-white/35">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            disabled={busy}
            placeholder="Anything FLOW should know when it writes this up…"
            className="min-h-14 w-full resize-none rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-60"
          />
        </div>

        {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}

        <button
          type="button"
          onClick={() => onSend(severity, context.trim())}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-black transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 [touch-action:manipulation]"
        >
          {busy ? "Sending to draft…" : "Send to background draft →"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">
          FLOW drafts it in the background — review and approve before it's in the report.
        </p>
      </div>
    </div>
  );
}
