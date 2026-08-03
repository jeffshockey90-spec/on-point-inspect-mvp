"use client";

import { useState } from "react";

// Per-section note shown above that section's findings in the report builder,
// and (read-only) on the client share page and print/PDF. Saves to
// report_section_notes via /api/report-section-notes.
export default function SectionNotesEditor({
  inspectionId,
  section,
  initialNotes,
}: {
  inspectionId: string;
  section: string;
  initialNotes?: string;
}) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/report-section-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, sectionName: section, notes: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save the note.");
      setNotes(draft.trim());
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-amber-300">
          Section note (shown to the client above this section)
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="e.g. The attic was only partially accessible due to stored belongings."
          className="w-full rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
        />
        {error && <p className="mt-2 text-xs font-bold text-red-300">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(notes);
              setEditing(false);
              setError("");
            }}
            disabled={saving}
            className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-black text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!notes.trim()) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-400 hover:text-amber-200"
      >
        + Add section note
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap text-sm leading-6 text-amber-100">{notes}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(notes);
            setEditing(true);
          }}
          className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-amber-400 hover:text-amber-200"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
