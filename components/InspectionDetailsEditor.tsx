"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "../lib/supabaseClient";

export default function InspectionDetailsEditor({
  inspection,
}: {
  inspection: any;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [weather, setWeather] = useState(
    inspection.weather ||
      inspection.weather_conditions ||
      inspection.inspection_weather ||
      ""
  );
  const [attendance, setAttendance] = useState(
    inspection.attendance ||
      inspection.in_attendance ||
      inspection.people_present ||
      ""
  );
  const [inspectionMethod, setInspectionMethod] = useState(
    inspection.inspection_method ||
      inspection.how_inspection_was_performed ||
      inspection.method ||
      "Visual inspection of readily accessible areas and components."
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const busy = saving || isRefreshing;

  async function saveDetails() {
    if (busy) return;

    if (!inspection?.id) {
      alert("Missing inspection ID.");
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const { error } = await supabase
        .from("inspections")
        .update({
          weather,
          attendance,
          inspection_method: inspectionMethod,
        })
        .eq("id", inspection.id);

      if (error) throw error;

      setSaved(true);
      setEditing(false);

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      alert(error?.message || "Failed to save inspection details.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setSaved(false);
          setEditing(true);
        }}
        disabled={busy}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2 font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {isRefreshing && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {isRefreshing ? "Updating..." : saved ? "Saved" : "Edit Inspection Details"}
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
      <div>
        <label className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
          Weather
        </label>
        <input
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
          Present / In Attendance
        </label>
        <input
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">
          Inspection Method
        </label>
        <textarea
          value={inspectionMethod}
          onChange={(e) => setInspectionMethod(e.target.value)}
          rows={4}
          disabled={busy}
          className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDetails}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-2 font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {saving ? "Saving..." : isRefreshing ? "Updating..." : "Save"}
        </button>

        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="rounded-xl border border-[var(--fl-line)] px-5 py-2 font-bold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
