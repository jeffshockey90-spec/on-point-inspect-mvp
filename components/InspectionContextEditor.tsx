"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "../lib/supabaseClient";

// Editable per-job "Context Layer" note. Whatever the inspector types here is
// fed to EVERY AI write-up on this inspection (field tool, live camera, voice,
// photo capture, summaries) via lib/ai/inspectionContext.ts, so the AI writes
// with job-specific context it can't see in a photo.
export default function InspectionContextEditor({
  inspection,
}: {
  inspection: any;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(
    inspection?.ai_context_notes || inspection?.ai_context || "",
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();

  const busy = saving || isRefreshing;

  async function save() {
    if (busy || !inspection?.id) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const { error } = await supabase
        .from("inspections")
        .update({ ai_context_notes: value.trim() || null })
        .eq("id", inspection.id);
      if (error) throw error;
      setSaved(true);
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || "Failed to save context.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
            AI Context for this inspection
          </h3>
          <p className="mt-1 text-xs text-[var(--fl-muted)]">
            Anything the AI should know while writing findings on this report —
            e.g. &quot;vacant ~2 years&quot;, &quot;recent flip&quot;, &quot;seller disclosed a prior
            roof leak&quot;, &quot;utilities were off&quot;. Applies to every AI write-up here.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
            className="shrink-0 rounded-lg border border-indigo-400/50 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:border-indigo-300 hover:text-[var(--fl-text)]"
          >
            {value.trim() ? "Edit" : "Add context"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. Home was vacant ~2 years; seller disclosed a prior roof leak in the northeast bedroom; utilities were on but water heater breaker was off at arrival."
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-sm text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save context"}
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(
                  inspection?.ai_context_notes || inspection?.ai_context || "",
                );
                setEditing(false);
                setError("");
              }}
              disabled={busy}
              className="text-xs font-semibold text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs font-bold text-rose-400">{error}</p>}
        </div>
      ) : value.trim() ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-3 text-sm text-[var(--fl-text)]">
          {value}
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-[var(--fl-faint)]">
          No extra context yet — the AI is using the property record and this
          inspection&apos;s findings automatically.
        </p>
      )}

      {saved && !editing && (
        <p className="mt-2 text-xs font-bold text-emerald-400">
          Saved — the AI will use this on every write-up for this report.
        </p>
      )}
    </section>
  );
}
