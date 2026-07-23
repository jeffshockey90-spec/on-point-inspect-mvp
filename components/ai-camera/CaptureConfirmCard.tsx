"use client";

import { useState } from "react";
import type { CaptureDraft } from "../../lib/ai/captureTypes";
import { SECTION_OPTIONS, SEVERITY_OPTIONS } from "../../lib/ai/captureTypes";

type Props = {
  mediaPreviewUrl: string;
  isVideo: boolean;
  draft: CaptureDraft;
  busy: boolean;
  error?: string;
  onAccept: (editedDraft: CaptureDraft) => void;
  onRetake: () => void;
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
  onAccept,
  onRetake,
}: Props) {
  const [edited, setEdited] = useState<CaptureDraft>(draft);

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

        <div className="mt-4 space-y-3">
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
          onClick={() => onAccept(edited)}
          disabled={busy}
          className="min-h-12 rounded-xl bg-emerald-400 px-2 py-3 text-sm font-black text-black disabled:opacity-50"
        >
          {busy ? "Saving…" : draft.kind === "reference" ? "Save" : "Accept & Save"}
        </button>
      </div>
    </div>
  );
}
