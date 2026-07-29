"use client";

import { useState } from "react";

export default function SectionNotesEditor({
  inspectionId,
  sectionNames,
  initialNotes,
}: {
  inspectionId: string;
  sectionNames: string[];
  initialNotes: Record<string, string>;
}) {
  const [selected, setSelected] = useState(sectionNames[0] || "");
  const [notesByName, setNotesByName] = useState<Record<string, string>>(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!selected || saving) return;

    try {
      setSaving(true);
      setError("");
      setSaved(false);

      const res = await fetch("/api/report-section-notes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          sectionName: selected,
          notes: notesByName[selected] || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save notes.");

      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Could not save notes.");
    } finally {
      setSaving(false);
    }
  }

  if (sectionNames.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-[#020817] p-5 text-sm text-slate-400">
        Add a custom section first (use &quot;+ Add Section&quot; in the section list), then come back
        here to add custom info to it.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#020817] p-4 sm:p-5">
      <p className="text-sm leading-6 text-slate-400">
        Add free-form info to a custom section - context, disclaimers, or details that don&apos;t fit
        as a finding. This shows above the findings for that section in the client report.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {sectionNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setSelected(name);
              setSaved(false);
              setError("");
            }}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${
              selected === name
                ? "border-teal-400 bg-teal-500/15 text-teal-200"
                : "border-slate-700 bg-[#071224] text-slate-300 hover:border-teal-500/50"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 p-2 text-xs font-bold text-red-300">
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2 text-xs font-bold text-emerald-300">
          Saved.
        </p>
      )}

      <textarea
        value={notesByName[selected] || ""}
        onChange={(e) => {
          setNotesByName((prev) => ({ ...prev, [selected]: e.target.value }));
          setSaved(false);
        }}
        rows={6}
        placeholder={`Custom info for "${selected}"...`}
        className="mt-3 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-sm text-white outline-none focus:border-teal-400"
      />

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-teal-500 px-5 py-3 font-black text-black hover:bg-teal-400 disabled:opacity-50 sm:w-auto"
      >
        {saving ? "Saving..." : "Save Notes"}
      </button>
    </div>
  );
}
