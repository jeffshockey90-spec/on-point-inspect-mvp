"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type FindingRow = {
  id: any;
  title?: string | null;
  section?: string | null;
  severity?: string | null;
};

// Opt-in "Link Findings" tool for the field. It only opens when the inspector
// taps the button -- it never pops up on its own, so it can't slow down capture.
// The inspector picks the findings they believe are related; AI only helps word
// the client-facing note.
export default function FieldFindingLinker({
  inspectionId,
  compact = false,
}: {
  inspectionId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [aiHint, setAiHint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function openLinker() {
    if (!inspectionId) return;
    setOpen(true);
    setError("");
    setDone("");
    setLoading(true);
    try {
      const { data, error: loadErr } = await supabase
        .from("findings")
        .select("id, title, section, severity")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });
      if (loadErr) throw loadErr;
      setFindings(data || []);
    } catch (e: any) {
      setError(e?.message || "Could not load findings.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function draftWithAi() {
    if (aiBusy || selectedIds.length < 2) return;
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/link-findings-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, findingIds: selectedIds, hint: aiHint }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.note) throw new Error(data.error || "AI drafting failed.");
      setNote(data.note);
    } catch (e: any) {
      setError(e?.message || "AI drafting failed.");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    if (saving || selectedIds.length < 2) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/findings/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, groupIds: selectedIds, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not link findings.");
      setDone(`Linked ${selectedIds.length} findings.`);
      setSelectedIds([]);
      setNote("");
      setAiHint("");
    } catch (e: any) {
      setError(e?.message || "Could not link findings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={openLinker}
          aria-label="Link findings"
          title="Link related findings"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-400/50 bg-[var(--fl-surface-2)] text-lg text-indigo-200 shadow-2xl backdrop-blur transition active:scale-95 [touch-action:manipulation]"
        >
          🔗
        </button>
      ) : (
        <button
          type="button"
          onClick={openLinker}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/60 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-200 transition active:scale-[0.98] hover:bg-indigo-500/20 [touch-action:manipulation]"
        >
          🔗 Link Findings
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-indigo-500/30 bg-[var(--fl-surface)] pb-[env(safe-area-inset-bottom)] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[var(--fl-raised)] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                  🔗 Link Related Findings
                </p>
                <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
                  Pick the findings you think share a cause.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-sm font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-[var(--fl-muted)]">Loading findings…</p>
              ) : findings.length < 2 ? (
                <p className="text-sm text-[var(--fl-muted)]">
                  You need at least two findings on this inspection to link them.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {findings.map((f) => {
                    const id = String(f.id);
                    const checked = selectedIds.includes(id);
                    return (
                      <label
                        key={id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                          checked
                            ? "border-indigo-400 bg-indigo-500/10"
                            : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] hover:border-indigo-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(id)}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-400"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[var(--fl-text)]">
                            {f.title || "Untitled finding"}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--fl-muted)]">
                            {f.section || "—"}
                            {f.severity ? ` · ${f.severity}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedIds.length >= 2 && (
                <div className="mt-4 space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                    Related observations note (client-facing)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="How are they related? Draft it with AI below, or type your own."
                    className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2 text-sm text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-indigo-400"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={aiHint}
                      onChange={(e) => setAiHint(e.target.value)}
                      placeholder="Tell AI how to word it (optional)"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={draftWithAi}
                      disabled={aiBusy}
                      className="rounded-lg border border-indigo-500/60 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/10 disabled:opacity-50"
                    >
                      {aiBusy ? "Drafting…" : note ? "Redraft with AI" : "Draft with AI"}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="mt-3 text-xs font-bold text-red-300">{error}</p>}
              {done && <p className="mt-3 text-xs font-bold text-emerald-300">{done}</p>}
            </div>

            <div className="border-t border-[var(--fl-raised)] p-4">
              <button
                type="button"
                onClick={save}
                disabled={saving || selectedIds.length < 2}
                className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                {saving
                  ? "Linking…"
                  : selectedIds.length >= 2
                    ? `Link ${selectedIds.length} findings`
                    : "Select at least two findings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
