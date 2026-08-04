"use client";

import { useState } from "react";
import type { CaptureDraft } from "../../lib/ai/captureTypes";
import { SECTION_OPTIONS, SEVERITY_OPTIONS } from "../../lib/ai/captureTypes";

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
              <Field label="Condition">
                <textarea
                  className={`${inputClass} min-h-16`}
                  value={edited.condition || ""}
                  onChange={(event) => update({ condition: event.target.value })}
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
          onClick={() => (attachTo ? onAttachToExisting?.(attachTo) : onAccept(edited))}
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
