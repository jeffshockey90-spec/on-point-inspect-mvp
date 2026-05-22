"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import FindingActions from "./FindingActions";

const SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

export default function EditableFinding({ finding }: { finding: any }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(finding.title || "");
  const [section, setSection] = useState(finding.section || "Exterior");
  const [severity, setSeverity] = useState(
    finding.severity || "Recommended Repair"
  );
  const [observation, setObservation] = useState(finding.observation || "");
  const [implication, setImplication] = useState(finding.implication || "");
  const [recommendation, setRecommendation] = useState(
    finding.recommendation || ""
  );
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  async function saveFinding() {
    setSaving(true);

    const { error } = await supabase
      .from("findings")
      .update({
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
      })
      .eq("id", finding.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setEditing(false);
    window.location.reload();
  }

  async function saveToLibrary() {
    if (!title.trim()) {
      alert("Add a title before saving to the comment library.");
      return;
    }

    setSavingTemplate(true);

    const { error } = await supabase.from("comment_library").insert({
      title,
      section,
      severity,
      observation,
      implication,
      recommendation,
      tags: `${section}, ${severity}`,
    });

    setSavingTemplate(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Saved to comment library.");
  }

  async function deleteFinding() {
    const confirmed = confirm("Delete this finding?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("findings")
      .delete()
      .eq("id", finding.id);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.reload();
  }

  if (!editing) {
    return (
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button
          onClick={() => setEditing(true)}
          className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-black hover:bg-teal-400"
        >
          Edit Finding
        </button>

        <button
          onClick={saveToLibrary}
          disabled={savingTemplate}
          className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-400 hover:bg-teal-500 hover:text-black"
        >
          {savingTemplate ? "Saving..." : "Save to Library"}
        </button>

        <button
          onClick={deleteFinding}
          className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500"
        >
          Delete Finding
        </button>

        <FindingActions finding={finding} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-slate-700 bg-[#111827] p-5 print:hidden">
      <div>
        <label className="mb-2 block text-sm font-bold text-slate-300">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-300">
            Section
          </label>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
          >
            {SECTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-300">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
          >
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Textarea
        label="Observation"
        value={observation}
        onChange={setObservation}
      />

      <Textarea
        label="Implication"
        value={implication}
        onChange={setImplication}
      />

      <Textarea
        label="Recommendation"
        value={recommendation}
        onChange={setRecommendation}
      />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={saveFinding}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-5 py-2 font-bold text-black hover:bg-teal-400"
        >
          {saving ? "Saving..." : "Save Finding"}
        </button>

        <button
          onClick={saveToLibrary}
          disabled={savingTemplate}
          className="rounded-xl border border-teal-500 px-5 py-2 font-bold text-teal-400 hover:bg-teal-500 hover:text-black"
        >
          {savingTemplate ? "Saving..." : "Save to Library"}
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

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-300">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-slate-700 bg-black p-3 leading-7 text-white"
      />
    </div>
  );
}