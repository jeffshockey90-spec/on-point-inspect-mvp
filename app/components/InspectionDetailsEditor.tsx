"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function InspectionDetailsEditor({
  inspection,
}: {
  inspection: any;
}) {
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

  async function saveDetails() {
    setSaving(true);

    const { error } = await supabase
      .from("inspections")
      .update({
        weather,
        attendance,
        inspection_method: inspectionMethod,
      })
      .eq("id", inspection.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setEditing(false);
    window.location.reload();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-5 rounded-xl bg-teal-500 px-4 py-2 font-bold text-black hover:bg-teal-400"
      >
        Edit Inspection Details
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-slate-700 bg-[#111827] p-5">
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-300">
          Weather
        </label>
        <input
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-slate-300">
          Present / In Attendance
        </label>
        <input
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-slate-300">
          Inspection Method
        </label>
        <textarea
          value={inspectionMethod}
          onChange={(e) => setInspectionMethod(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveDetails}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-5 py-2 font-bold text-black hover:bg-teal-400"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={() => setEditing(false)}
          className="rounded-xl border border-slate-600 px-5 py-2 font-bold text-white hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}