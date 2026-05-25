"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

  const [repairRequest, setRepairRequest] = useState(
    finding.repair_request || false
  );
  const [repairPriority, setRepairPriority] = useState(
    finding.repair_priority || "Recommended"
  );
  const [repairNotes, setRepairNotes] = useState(finding.repair_notes || "");

  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [rewriting, setRewriting] = useState(false);

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
        repair_request: repairRequest,
        repair_priority: repairPriority,
        repair_notes: repairNotes,
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

  async function saveRepairRequestSettings() {
    const { error } = await supabase
      .from("findings")
      .update({
        repair_request: repairRequest,
        repair_priority: repairPriority,
        repair_notes: repairNotes,
      })
      .eq("id", finding.id);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.reload();
  }

  async function rewriteSofter() {
    setRewriting(true);

    const response = await fetch("/api/rewrite-finding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        observation,
        implication,
        recommendation,
      }),
    });

    const data = await response.json();
    setRewriting(false);

    if (!data.rewritten) {
      alert("Failed to rewrite finding");
      return;
    }

    const { error } = await supabase
      .from("findings")
      .update({
        recommendation: data.rewritten,
      })
      .eq("id", finding.id);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.reload();
  }

  async function saveToLibrary() {
    if (!title.trim()) {
      alert("Add a title before saving.");
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
      <div className="mt-6 space-y-5 print:hidden">
        <div className="rounded-2xl border border-teal-700 bg-gradient-to-r from-[#052b2b] to-[#071b35] p-5">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-teal-300">
            AI / Repair Request Tools
          </h4>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={rewriteSofter}
              disabled={rewriting}
              className="min-w-[220px] rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
            >
              {rewriting ? "Rewriting..." : "AI Rewrite Softer"}
            </button>

            <button
              onClick={() => setRepairRequest(!repairRequest)}
              className="min-w-[220px] rounded-xl border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              {repairRequest ? "Remove From Request" : "Add To Repair Request"}
            </button>

            <button
              onClick={saveRepairRequestSettings}
              className="min-w-[220px] rounded-xl border border-orange-500 px-5 py-3 text-sm font-bold text-orange-400 hover:bg-orange-500/10"
            >
              Save Repair Request
            </button>
          </div>

          {repairRequest && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select
                value={repairPriority}
                onChange={(e) => setRepairPriority(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"
              >
                <option>Safety</option>
                <option>Major</option>
                <option>Recommended</option>
                <option>Informational</option>
              </select>

              <textarea
                placeholder="Repair request notes..."
                value={repairNotes}
                onChange={(e) => setRepairNotes(e.target.value)}
                className="min-h-[90px] rounded-xl border border-slate-700 bg-slate-900 p-3 text-white md:col-span-2"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setEditing(true)}
            className="min-w-[170px] rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400"
          >
            Edit Finding
          </button>

          <button
            onClick={saveToLibrary}
            disabled={savingTemplate}
            className="min-w-[170px] rounded-xl border border-cyan-500 px-5 py-3 text-sm font-bold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-60"
          >
            {savingTemplate ? "Saving..." : "Save to Library"}
          </button>

          <button
            onClick={deleteFinding}
            className="min-w-[170px] rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500"
          >
            Delete Finding
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-slate-700 bg-[#111827] p-5 print:hidden">
      <Input label="Title" value={title} onChange={setTitle} />

      <div className="grid gap-4 md:grid-cols-2">
        <Select label="Section" value={section} onChange={setSection} options={SECTIONS} />
        <Select label="Severity" value={severity} onChange={setSeverity} options={SEVERITIES} />
      </div>

      <Textarea label="Observation" value={observation} onChange={setObservation} />
      <Textarea label="Implication" value={implication} onChange={setImplication} />
      <Textarea label="Recommendation" value={recommendation} onChange={setRecommendation} />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={saveFinding}
          disabled={saving}
          className="min-w-[170px] rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-black hover:bg-teal-400 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Finding"}
        </button>

        <button
          onClick={() => setEditing(false)}
          className="min-w-[170px] rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-black p-3 text-white"
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
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
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-slate-700 bg-black p-3 leading-7 text-white"
      />
    </label>
  );
}