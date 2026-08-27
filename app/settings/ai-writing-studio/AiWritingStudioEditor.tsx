"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AI_WRITING_CONFIG,
  normalizeWritingConfig,
  buildPreviewNarrative,
  SEVERITIES,
  SOP_OPTIONS,
  LENGTH_OPTIONS,
  DETAIL_OPTIONS,
  TONE_OPTIONS,
  type AiWritingConfig,
  type Severity,
  type WritingLength,
  type WritingDetail,
  type WritingTone,
} from "../../../lib/ai/writingStyle";

type Opt<T> = { value: T; label: string; hint?: string };

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-xl border px-4 py-2.5 text-left transition disabled:opacity-50 ${
              active
                ? "border-teal-400 bg-teal-500/15 text-teal-100"
                : "border-[#232b38] bg-[#10151e] text-[#8a93a3] hover:border-[#59626f]"
            }`}
          >
            <span className="block text-sm font-semibold">{o.label}</span>
            {o.hint && (
              <span className="mt-0.5 block text-xs font-semibold text-[#8a93a3]">
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a93a3]">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function AiWritingStudioEditor() {
  const [config, setConfig] = useState<AiWritingConfig>(DEFAULT_AI_WRITING_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  const [message, setMessage] = useState("");
  const [previewSeverity, setPreviewSeverity] = useState<Severity>("Recommended Repair");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ai-writing-settings");
        const data = await res.json();
        if (!alive) return;
        setConfig(normalizeWritingConfig(data.config));
        setIsOwner(data.isOwner !== false);
      } catch {
        if (alive) setMessage("Could not load your settings — showing defaults.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const preview = useMemo(
    () => buildPreviewNarrative(config, previewSeverity),
    [config, previewSeverity],
  );

  function patch(p: Partial<AiWritingConfig>) {
    setConfig((c) => ({ ...c, ...p }));
    setMessage("");
  }

  function patchOverride(
    sev: Severity,
    p: Partial<AiWritingConfig["severityOverrides"][Severity]>,
  ) {
    setConfig((c) => ({
      ...c,
      severityOverrides: {
        ...c.severityOverrides,
        [sev]: { ...c.severityOverrides[sev], ...p },
      },
    }));
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/ai-writing-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not save.");
      } else {
        setConfig(normalizeWritingConfig(data.config));
        setMessage("Saved. New findings will use these settings.");
      }
    } catch {
      setMessage("Could not save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-[#8a93a3]">Loading your AI writing settings…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      {/* Left: controls */}
      <div className="space-y-6">
        {!isOwner && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
            Only the company owner can change these. You’re viewing the current settings.
          </div>
        )}

        <section className="rounded-2xl border border-[#232b38] bg-[#10151e] p-5">
          <h2 className="text-lg font-semibold text-white">Standards</h2>
          <p className="mt-1 text-sm text-[#8a93a3]">
            The Standards of Practice your narratives reference. Recommendations are framed in
            language consistent with this standard.
          </p>
          <div className="mt-4">
            <Field label="SOP Standard">
              <Segmented
                value={config.sopStandard}
                options={SOP_OPTIONS as Opt<AiWritingConfig["sopStandard"]>[]}
                onChange={(v) => patch({ sopStandard: v })}
                disabled={!isOwner}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-[#232b38] bg-[#10151e] p-5">
          <h2 className="text-lg font-semibold text-white">Narrative defaults</h2>
          <p className="mt-1 text-sm text-[#8a93a3]">
            The baseline length, detail, and tone for every finding. Per-severity rows below can
            override these.
          </p>
          <div className="mt-4 space-y-5">
            <Field label="Length">
              <Segmented
                value={config.length}
                options={LENGTH_OPTIONS as Opt<WritingLength>[]}
                onChange={(v) => patch({ length: v })}
                disabled={!isOwner}
              />
            </Field>
            <Field label="Detail">
              <Segmented
                value={config.detail}
                options={DETAIL_OPTIONS as Opt<WritingDetail>[]}
                onChange={(v) => patch({ detail: v })}
                disabled={!isOwner}
              />
            </Field>
            <Field label="Tone">
              <Segmented
                value={config.tone}
                options={TONE_OPTIONS as Opt<WritingTone>[]}
                onChange={(v) => patch({ tone: v })}
                disabled={!isOwner}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-[#232b38] bg-[#10151e] p-5">
          <h2 className="text-lg font-semibold text-white">By severity</h2>
          <p className="mt-1 text-sm text-[#8a93a3]">
            Fine-tune specific severities — e.g. keep minor findings short and plain, but give
            safety and major concerns the full technical treatment. “Inherit” uses the defaults
            above.
          </p>
          <div className="mt-4 space-y-3">
            {SEVERITIES.map((sev) => {
              const o = config.severityOverrides[sev];
              return (
                <div
                  key={sev}
                  className="rounded-xl border border-[#1a212c] bg-[#070f1e] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{sev}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[#8a93a3]">
                      <input
                        type="checkbox"
                        checked={o.inherit}
                        disabled={!isOwner}
                        onChange={(e) => patchOverride(sev, { inherit: e.target.checked })}
                        className="h-4 w-4 accent-teal-400"
                      />
                      Inherit defaults
                    </label>
                  </div>
                  {!o.inherit && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <select
                        value={o.length}
                        disabled={!isOwner}
                        onChange={(e) =>
                          patchOverride(sev, { length: e.target.value as WritingLength })
                        }
                        className="rounded-lg border border-[#232b38] bg-[#10151e] px-3 py-2 text-sm font-semibold text-[#e8ecf3]"
                      >
                        {LENGTH_OPTIONS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label} — {op.hint}
                          </option>
                        ))}
                      </select>
                      <select
                        value={o.detail}
                        disabled={!isOwner}
                        onChange={(e) =>
                          patchOverride(sev, { detail: e.target.value as WritingDetail })
                        }
                        className="rounded-lg border border-[#232b38] bg-[#10151e] px-3 py-2 text-sm font-semibold text-[#e8ecf3]"
                      >
                        {DETAIL_OPTIONS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={o.tone}
                        disabled={!isOwner}
                        onChange={(e) =>
                          patchOverride(sev, { tone: e.target.value as WritingTone })
                        }
                        className="rounded-lg border border-[#232b38] bg-[#10151e] px-3 py-2 text-sm font-semibold text-[#e8ecf3]"
                      >
                        {TONE_OPTIONS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-teal-400 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            {message && (
              <span className="text-sm font-bold text-teal-200">{message}</span>
            )}
          </div>
        )}
      </div>

      {/* Right: live preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-2xl border border-teal-500/30 bg-[#071224] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-teal-200">Preview</h2>
            <select
              value={previewSeverity}
              onChange={(e) => setPreviewSeverity(e.target.value as Severity)}
              className="rounded-lg border border-[#232b38] bg-[#10151e] px-2 py-1.5 text-xs font-bold text-[#e8ecf3]"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-[#8a93a3]">
            Example finding write-up with your settings. Updates as you change them.
          </p>

          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-teal-300">
            Narratives reference: {config.sopStandard} Standards of Practice
          </p>

          <div className="mt-3 rounded-xl border border-[#232b38] bg-[#10151e] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              {preview.meta}
            </p>
            <h3 className="mt-2 text-base font-semibold text-white">{preview.title}</h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#e8ecf3]">
              {preview.body}
            </p>
          </div>

          <p className="mt-3 text-xs text-[#59626f]">
            Sample defect for illustration. Your actual findings are written from each finding’s
            own photos and notes.
          </p>
        </section>
      </div>
    </div>
  );
}
