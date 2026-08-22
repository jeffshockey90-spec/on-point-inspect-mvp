"use client";

import { useState } from "react";
import type { CaptureDraft } from "../../lib/ai/captureTypes";
import { SECTION_OPTIONS, SEVERITY_OPTIONS } from "../../lib/ai/captureTypes";
import FindingToneControl from "../FindingToneControl";

type ExistingFinding = { id: string; title?: string; section?: string };

type Props = {
  mediaPreviewUrl: string;
  isVideo: boolean;
  draft: CaptureDraft;
  busy: boolean;
  error?: string;
  initialNote?: string;
  existingFindings?: ExistingFinding[];
  onAccept: (editedDraft: CaptureDraft) => void;
  onRegenerate?: (note: string) => void;
  onAttachToExisting?: (findingId: string) => void;
  onRetake: () => void;
  onMarkup?: () => void;
  // Extra angles bundled into this one finding (multi-photo capture).
  extraPreviewUrls?: string[];
  // Present only for photo findings — snap another angle into the same defect.
  onAddAngle?: () => void;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400";
const labelClass = "text-[11px] font-black uppercase tracking-wide text-slate-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

// Values the analyzer returns as "not found" — hidden from the read-only
// intelligence display so the inspector only sees real data.
function isKnownValue(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return false;
  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(clean.toLowerCase());
}

// Compact read-only row for computed equipment intelligence.
function ReadRow({ label, value }: { label: string; value: unknown }) {
  if (!isKnownValue(value)) return null;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-slate-100">
        {String(value)}
      </span>
    </div>
  );
}

const CATEGORY_LABEL: Record<CaptureDraft["kind"], string> = {
  finding: "Finding",
  limitation: "Limitation",
  equipment: "Equipment",
  reference: "Reference Photo",
};

export default function CaptureConfirmCard({
  mediaPreviewUrl,
  isVideo,
  draft,
  busy,
  error,
  initialNote,
  existingFindings,
  onAccept,
  onRegenerate,
  onAttachToExisting,
  onRetake,
  onMarkup,
  extraPreviewUrls,
  onAddAngle,
}: Props) {
  const [edited, setEdited] = useState<CaptureDraft>(draft);
  const [note, setNote] = useState(initialNote || "");
  const [showNote, setShowNote] = useState(false);
  const [attachTo, setAttachTo] = useState("");

  const canRegenerate = Boolean(onRegenerate) && draft.kind !== "reference";
  const canAttach =
    Boolean(onAttachToExisting) && draft.kind === "finding" && (existingFindings?.length || 0) > 0;

  function update(patch: Partial<CaptureDraft>) {
    setEdited((current) => ({ ...current, ...patch }) as CaptureDraft);
  }

  // Teach the per-inspector learning brain from the AI draft (the `draft` prop
  // this card was given) vs. the finalized values the inspector accepts.
  // Fire-and-forget; must never block or break the accept/save.
  function emitLiveCameraLearning(finalDraft: CaptureDraft) {
    if (draft.kind !== "finding" || finalDraft.kind !== "finding") return;

    try {
      void fetch("/api/ai/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: null,
          tool: "live_camera",
          original: {
            title: draft.title,
            section: draft.section,
            severity: draft.severity,
            observation: draft.observation,
            implication: draft.implication,
            recommendation: draft.recommendation,
          },
          updated: {
            title: finalDraft.title,
            section: finalDraft.section,
            severity: finalDraft.severity,
            observation: finalDraft.observation,
            implication: finalDraft.implication,
            recommendation: finalDraft.recommendation,
          },
          accepted: true,
          notes:
            "Inspector accepted an AI-generated finding. Learn wording, severity, and section-routing preferences from the before/after.",
        }),
      }).catch(() => {});
    } catch {
      // Learning must never block saving.
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
          Confirm {CATEGORY_LABEL[draft.kind]}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          {isVideo ? (
            <video
              src={mediaPreviewUrl}
              className="max-h-48 w-full object-cover"
              controls
              playsInline
            />
          ) : (
            <img
              src={mediaPreviewUrl}
              alt="Captured evidence"
              className="max-h-48 w-full object-cover"
            />
          )}
        </div>

        {extraPreviewUrls && extraPreviewUrls.length > 1 && (
          <div className="mt-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-cyan-300">
              {extraPreviewUrls.length} photos in this finding
            </p>
            <div className="mt-1 flex gap-2 overflow-x-auto">
              {extraPreviewUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Angle ${i + 1}`}
                  className="h-14 w-14 flex-none rounded-lg border border-white/15 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {!isVideo && onMarkup && (
          <button
            type="button"
            onClick={onMarkup}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-cyan-400/60 bg-cyan-500/10 px-4 py-2.5 text-sm font-black text-cyan-200 disabled:opacity-50"
          >
            🖊 Markup Photo (optional)
          </button>
        )}

        {onAddAngle && (
          <button
            type="button"
            onClick={onAddAngle}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-teal-400/60 bg-teal-500/10 px-4 py-2.5 text-sm font-black text-teal-200 disabled:opacity-50"
          >
            ＋ Add another angle to this defect
          </button>
        )}

        {/* Attach this capture to a defect already in the report */}
        {canAttach && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3">
            <label className={labelClass}>Attach to an existing defect</label>
            <select
              className={inputClass}
              value={attachTo}
              onChange={(event) => setAttachTo(event.target.value)}
              disabled={busy}
            >
              <option value="">— Create a new finding —</option>
              {existingFindings!.map((f) => (
                <option key={f.id} value={f.id}>
                  {(f.title || "Untitled").slice(0, 60)}
                  {f.section ? ` · ${f.section}` : ""}
                </option>
              ))}
            </select>
            {attachTo && (
              <p className="mt-2 text-[11px] font-bold text-cyan-200">
                This photo/video will be added to that defect. The write-up below is skipped.
              </p>
            )}
          </div>
        )}

        {/* Regenerate the AI write-up from a fresh inspector note — no retake */}
        {canRegenerate && !attachTo && (
          <div className="mt-3">
            {!showNote ? (
              <button
                type="button"
                onClick={() => {
                  setNote(initialNote || "");
                  setShowNote(true);
                }}
                disabled={busy}
                className="w-full rounded-xl border border-cyan-400/60 bg-cyan-500/10 px-4 py-2.5 text-sm font-black text-cyan-200 disabled:opacity-50"
              >
                ✍️ Adjust write-up from inspector note
              </button>
            ) : (
              <div className="rounded-xl border border-cyan-400/40 bg-black/40 p-3">
                <label className={labelClass}>Inspector note for AI</label>
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={note}
                  autoFocus
                  placeholder="e.g. focus on the cracked heat exchanger and note the rust at the base"
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNote(false)}
                    disabled={busy}
                    className="rounded-lg border border-slate-500 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onRegenerate?.(note)}
                    disabled={busy}
                    className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-black text-black disabled:opacity-50"
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`mt-4 space-y-3 ${attachTo ? "hidden" : ""}`}>
          {edited.kind === "finding" && (
            <>
              <Field label="Title">
                <input
                  className={inputClass}
                  value={edited.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Section">
                  <select
                    className={inputClass}
                    value={edited.section}
                    onChange={(event) => update({ section: event.target.value })}
                  >
                    {SECTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    className={inputClass}
                    value={edited.severity}
                    onChange={(event) => update({ severity: event.target.value })}
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Observation">
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={edited.observation}
                  onChange={(event) => update({ observation: event.target.value })}
                />
              </Field>
              <Field label="Implication">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.implication}
                  onChange={(event) => update({ implication: event.target.value })}
                />
              </Field>
              <Field label="Recommendation">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.recommendation}
                  onChange={(event) => update({ recommendation: event.target.value })}
                />
              </Field>
              <FindingToneControl
                fields={{
                  title: edited.title,
                  severity: edited.severity,
                  observation: edited.observation,
                  implication: edited.implication,
                  recommendation: edited.recommendation,
                }}
                onApply={(f) =>
                  update({
                    observation: f.observation,
                    implication: f.implication,
                    recommendation: f.recommendation,
                  })
                }
              />
            </>
          )}

          {edited.kind === "limitation" && (
            <>
              <Field label="Title">
                <input
                  className={inputClass}
                  value={edited.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Field>
              <Field label="Section">
                <select
                  className={inputClass}
                  value={edited.section}
                  onChange={(event) => update({ section: event.target.value })}
                >
                  {SECTION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Limitation">
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={edited.limitation}
                  onChange={(event) => update({ limitation: event.target.value })}
                />
              </Field>
              <Field label="Recommendation">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.recommendation || ""}
                  onChange={(event) => update({ recommendation: event.target.value })}
                />
              </Field>
            </>
          )}

          {edited.kind === "equipment" && (
            <>
              {edited.equipmentStatus && isKnownValue(edited.equipmentStatus) && (
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-black text-cyan-200">
                  {String(edited.equipmentStatus)}
                </div>
              )}

              <Field label="Equipment Type">
                <input
                  className={inputClass}
                  value={edited.equipmentType || ""}
                  onChange={(event) => update({ equipmentType: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Manufacturer">
                  <input
                    className={inputClass}
                    value={edited.manufacturer || ""}
                    onChange={(event) => update({ manufacturer: event.target.value })}
                  />
                </Field>
                <Field label="Model">
                  <input
                    className={inputClass}
                    value={edited.model || ""}
                    onChange={(event) => update({ model: event.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Serial">
                  <input
                    className={inputClass}
                    value={edited.serial || ""}
                    onChange={(event) => update({ serial: event.target.value })}
                  />
                </Field>
                <Field label="Manufacture Year">
                  <input
                    className={inputClass}
                    value={String(edited.manufactureYear || "")}
                    onChange={(event) => update({ manufactureYear: event.target.value })}
                  />
                </Field>
              </div>

              {/* Full equipment intelligence the analyzer returned (read-only). */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-cyan-300">
                  AI Equipment Intelligence
                </p>
                <div>
                  <ReadRow label="Estimated Age" value={edited.estimatedAge} />
                  <ReadRow label="Expected Life" value={edited.expectedServiceLife} />
                  <ReadRow
                    label="Life Used"
                    value={
                      Number(edited.lifeExpectancyPercent) > 0
                        ? `${Math.min(150, Math.round(Number(edited.lifeExpectancyPercent)))}% of upper typical range`
                        : ""
                    }
                  />
                  <ReadRow label="Capacity" value={edited.capacity || edited.estimatedBTU} />
                  <ReadRow label="Fuel Type" value={edited.fuelType} />
                  <ReadRow label="Refrigerant" value={edited.refrigerant} />
                  <ReadRow label="Est. SEER" value={edited.estimatedSEER} />
                  <ReadRow label="Est. AFUE" value={edited.estimatedAFUE} />
                  <ReadRow
                    label="Heating Efficiency"
                    value={edited.estimatedHeatingEfficiency}
                  />
                  <ReadRow label="Efficiency" value={edited.efficiency} />
                  <ReadRow
                    label="Replacement Planning"
                    value={edited.replacementCostEstimate}
                  />
                  <ReadRow
                    label="Confidence"
                    value={
                      Number(edited.confidenceScore) > 0
                        ? `${Math.round(Number(edited.confidenceScore))}%`
                        : ""
                    }
                  />
                </div>

                {isKnownValue(edited.maintenanceSchedule) && (
                  <div className="mt-3">
                    <p className={labelClass}>Maintenance Schedule</p>
                    <p className="mt-1 text-sm leading-6 text-slate-200">
                      {String(edited.maintenanceSchedule)}
                    </p>
                  </div>
                )}

                {Array.isArray(edited.knownFailurePatterns) &&
                  edited.knownFailurePatterns.length > 0 && (
                    <div className="mt-3">
                      <p className={labelClass}>Common Failure Patterns</p>
                      <ul className="mt-1 space-y-0.5 text-sm leading-6 text-slate-200">
                        {edited.knownFailurePatterns.slice(0, 5).map((item) => (
                          <li key={String(item)}>• {String(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {isKnownValue(edited.recallAwareness) && (
                  <div className="mt-3">
                    <p className={labelClass}>Recall Awareness</p>
                    <p className="mt-1 text-sm leading-6 text-slate-200">
                      {String(edited.recallAwareness)}
                    </p>
                  </div>
                )}
              </div>

              {/* Report write-up — editable before saving. */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Section">
                  <select
                    className={inputClass}
                    value={
                      SECTION_OPTIONS.includes(String(edited.section || ""))
                        ? String(edited.section)
                        : ""
                    }
                    onChange={(event) => update({ section: event.target.value })}
                  >
                    <option value="">—</option>
                    {SECTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    className={inputClass}
                    value={
                      SEVERITY_OPTIONS.includes(String(edited.severity || ""))
                        ? String(edited.severity)
                        : ""
                    }
                    onChange={(event) => update({ severity: event.target.value })}
                  >
                    <option value="">—</option>
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Condition">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.condition || ""}
                  onChange={(event) => update({ condition: event.target.value })}
                />
              </Field>
              <Field label="Observation">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.observation || ""}
                  onChange={(event) => update({ observation: event.target.value })}
                />
              </Field>
              <Field label="Implication">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.implication || ""}
                  onChange={(event) => update({ implication: event.target.value })}
                />
              </Field>
              <Field label="Recommendation">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.recommendation || ""}
                  onChange={(event) => update({ recommendation: event.target.value })}
                />
              </Field>
            </>
          )}

          {edited.kind === "reference" && (
            <Field label="Caption (optional)">
              <input
                className={inputClass}
                value={edited.caption}
                placeholder="What does this photo show?"
                onChange={(event) => update({ caption: event.target.value })}
              />
            </Field>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onRetake}
          disabled={busy}
          className="min-h-12 rounded-xl border border-slate-500 px-2 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          Retake
        </button>
        <button
          type="button"
          onClick={() => {
            if (attachTo) {
              onAttachToExisting?.(attachTo);
            } else {
              emitLiveCameraLearning(edited);
              onAccept(edited);
            }
          }}
          disabled={busy}
          className="min-h-12 rounded-xl bg-emerald-400 px-2 py-3 text-sm font-black text-black disabled:opacity-50"
        >
          {busy
            ? "Saving…"
            : attachTo
              ? "Attach to Defect"
              : draft.kind === "reference"
                ? "Save"
                : "Accept & Save"}
        </button>
      </div>
    </div>
  );
}
