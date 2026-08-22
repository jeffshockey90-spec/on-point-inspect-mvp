"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

// Inline "correct the hours" control for one inspection's timesheet row. Posts
// to /api/timesheets/override and refreshes so the corrected hours flow into
// the totals and CSV.
export default function TimesheetOverrideCell({
  inspectionId,
  current,
  manual,
}: {
  inspectionId: number;
  current: number | null;
  manual: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current != null ? String(current) : "");
  const [saving, setSaving] = useState(false);

  async function save(clear = false) {
    setSaving(true);
    try {
      await fetch("/api/timesheets/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          hours: clear ? null : value === "" ? null : Number(value),
        }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-300 transition hover:border-teal-400 hover:text-teal-300"
      >
        <Pencil className="h-3 w-3" />
        {manual ? "Edit" : "Correct"}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step="0.1"
        min="0"
        max="24"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="hrs"
        className="w-16 rounded-lg border border-slate-600 bg-black px-2 py-1 text-right text-xs text-white outline-none focus:border-teal-400"
      />
      <button
        type="button"
        onClick={() => save(false)}
        disabled={saving}
        className="rounded-lg bg-teal-500 px-2 py-1 text-[11px] font-black text-slate-950 disabled:opacity-50"
      >
        Save
      </button>
      {(manual || current != null) && (
        <button
          type="button"
          onClick={() => save(true)}
          disabled={saving}
          className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-400 hover:text-red-300"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={saving}
        className="text-[11px] font-black text-slate-500"
      >
        ✕
      </button>
    </span>
  );
}
