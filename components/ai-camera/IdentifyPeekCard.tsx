"use client";

// Point-and-identify peek card. Shown over the live view after the inspector
// taps Identify. It LABELS what the camera is pointing at and proposes a
// severity, then lets the inspector adjust the severity, add context, and hand
// it off to the background draft — or dismiss it. It reads the section's
// system-info values from the photo on its own, but only writes the ones the
// inspector approves (empty fields only); "Send to draft" queues the same
// background pipeline every capture uses.

import { useEffect, useRef, useState } from "react";
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
  /** Starting section for the fill ("" = none matched; the inspector picks). */
  fillSectionLabel?: string;
  /** Every section a photo can fill, for the picker. */
  fillSections?: string[];
  /** Read the photo for this section's boxes (no write). */
  onFillChecklist?: (
    section: string,
  ) => Promise<{ written: number; values: string[]; found: { group: string; value: string }[] }>;
  /** Write ONLY the values the inspector approved; returns how many were added. */
  onApplyFills?: (section: string, approved: { group: string; value: string }[]) => Promise<number>;
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
  fillSections,
  onFillChecklist,
  onApplyFills,
  onSend,
  onDismiss,
}: Props) {
  const config = useSeverityConfig();
  // Resolve the AI's canonical severity to THIS company's label so custom
  // (renamed/recolored) severities are what the inspector sees and picks from.
  const [severity, setSeverity] = useState<string>(() => severityLabel(config, result.severity));
  const [context, setContext] = useState("");
  const badge = severityBadgeStyle(config, severity);

  // Section system-info: the photo is READ automatically, but nothing is
  // ticked until the inspector approves. reading -> review (checkbox per value)
  // -> Add -> added. Only empty fields are ever filled.
  const [fillState, setFillState] = useState<
    "idle" | "reading" | "review" | "adding" | "added" | "none" | "error"
  >("idle");
  const [found, setFound] = useState<{ group: string; value: string }[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addedCount, setAddedCount] = useState(0);
  const [fillError, setFillError] = useState("");
  const [fillSection, setFillSection] = useState(fillSectionLabel || "");
  // A short, friendly name for the section ("Attic, Insulation & Ventilation" -> "Attic").
  const shortSection = (fillSection || "").split(/[,&]/)[0].trim() || "section";
  const keyOf = (f: { group: string; value: string }) => `${f.group}|${f.value}`;

  async function handleRead(target = fillSection) {
    if (!onFillChecklist || fillState === "reading" || !target) return;
    setFillState("reading");
    setFillError("");
    try {
      const summary = await onFillChecklist(target);
      const items = summary.found || [];
      setFound(items);
      setChecked(new Set(items.map(keyOf)));
      setFillState(items.length ? "review" : "none");
    } catch (err: any) {
      setFillError(err?.message || "Couldn't read that — try again.");
      setFillState("error");
    }
  }

  async function handleApprove() {
    if (!onApplyFills || fillState === "adding") return;
    const approved = found.filter((f) => checked.has(keyOf(f)));
    if (!approved.length) return;
    setFillState("adding");
    setFillError("");
    try {
      setAddedCount(await onApplyFills(fillSection, approved));
      setFillState("added");
    } catch (err: any) {
      setFillError(err?.message || "Couldn't add those — try again.");
      setFillState("review");
    }
  }

  function toggle(f: { group: string; value: string }) {
    setChecked((prev) => {
      const next = new Set(prev);
      const k = keyOf(f);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Read automatically when the card opens (once) so the suggestions are ready
  // — reading never writes anything.
  const autoReadRef = useRef(false);
  useEffect(() => {
    if (autoReadRef.current || !canFillChecklist || !onFillChecklist || !fillSection) return;
    autoReadRef.current = true;
    void handleRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFillChecklist, onFillChecklist]);

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
            {(fillSections || []).length > 0 && (
              <label className="mb-2 flex items-center gap-2 text-[11px] text-white/60">
                <span className="shrink-0 font-semibold uppercase tracking-wide">Fill boxes in</span>
                <select
                  value={fillSection}
                  onChange={(event) => {
                    setFillSection(event.target.value);
                    setFillState("idle");
                    setFound([]);
                    setFillError("");
                  }}
                  disabled={busy || fillState === "reading" || fillState === "adding"}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
                >
                  {!fillSection && <option value="">Choose a section…</option>}
                  {(fillSections || []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {fillState === "review" || fillState === "adding" ? (
              <div className="text-xs">
                <p className="font-semibold text-cyan-200">Found in the photo — approve what to add:</p>
                <ul className="mt-1.5 space-y-1">
                  {found.map((f) => (
                    <li key={keyOf(f)}>
                      <label className="flex cursor-pointer items-center gap-2 text-white/80">
                        <input
                          type="checkbox"
                          checked={checked.has(keyOf(f))}
                          onChange={() => toggle(f)}
                          disabled={fillState === "adding"}
                          className="h-4 w-4 accent-cyan-400"
                        />
                        <span>
                          {f.group} · <span className="font-semibold text-white">{f.value}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={busy || fillState === "adding" || checked.size === 0}
                  className="mt-2 flex w-full items-center justify-center rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50 [touch-action:manipulation]"
                >
                  {fillState === "adding"
                    ? "Adding…"
                    : `✓ Add ${checked.size} to ${shortSection} info`}
                </button>
                <p className="mt-1 text-center text-[11px] text-white/40">
                  Nothing is added until you tap Add. Fields you already filled are never changed.
                </p>
                {fillError && <p className="mt-1 text-center text-[11px] font-semibold text-red-300">{fillError}</p>}
              </div>
            ) : fillState === "added" ? (
              <p className="text-xs font-semibold text-emerald-300">
                {addedCount > 0
                  ? `✓ Added ${addedCount} to ${shortSection} info`
                  : `Those were already filled in ${shortSection} info — nothing changed.`}
              </p>
            ) : fillState === "none" ? (
              <div className="text-xs text-white/60">
                Couldn&apos;t read anything to add for {shortSection}.
                <button
                  type="button"
                  onClick={() => void handleRead()}
                  className="ml-2 font-semibold text-cyan-300 underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleRead()}
                  disabled={busy || fillState === "reading" || !fillSection}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition active:scale-[0.99] disabled:opacity-50 [touch-action:manipulation]"
                >
                  {!fillSection
                    ? "Pick a section above to read its boxes"
                    : fillState === "reading"
                      ? `Reading ${shortSection} system info…`
                      : fillState === "error"
                        ? `Try again: read ${shortSection} system info`
                        : `🔎 Read ${shortSection} system info`}
                </button>
                {fillState === "error" && fillError && (
                  <p className="mt-1.5 text-center text-[11px] font-semibold text-red-300">{fillError}</p>
                )}
              </>
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
