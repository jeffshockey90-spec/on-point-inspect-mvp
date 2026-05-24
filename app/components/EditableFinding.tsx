"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
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

  const [observation, setObservation] = useState(
    finding.observation || ""
  );

  const [implication, setImplication] = useState(
    finding.implication || ""
  );

  const [recommendation, setRecommendation] = useState(
    finding.recommendation || ""
  );

  const [repairRequest, setRepairRequest] = useState(
    finding.repair_request || false
  );

  const [repairPriority, setRepairPriority] = useState(
    finding.repair_priority || "Recommended"
  );

  const [repairNotes, setRepairNotes] = useState(
    finding.repair_notes || ""
  );

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

    const { error } = await supabase
      .from("comment_library")
      .insert({
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
      <div className="mt-6 space-y-4 print:hidden">
        <div className="rounded-2xl border border-teal-700/60 bg-[#071f26] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-teal-300">
              AI / Repair Request Tools
            </p>

            {repairRequest && (
              <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-300">
                Added
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <button
              onClick={rewriteSofter}
              disabled={rewriting}
              className="rounded-xl bg-teal-500 px-4 py-3 font-bold text-black hover:bg-teal-400 disabled:opacity-60"
            >
              {rewriting
                ? "Rewriting..."
                : "AI Rewrite Softer"}
            </button>

            <button
              onClick={() =>
                setRepairRequest(!repairRequest)
              }
              className={`rounded-xl border px-4 py-3 font-bold transition ${
                repairRequest
                  ? "border-orange-500 bg-orange-500 text-black"
                  : "border-slate-600 bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              {repairRequest
                ? "Remove From Request"
                : "Add To Repair Request"}
            </button>

            <button
              onClick={saveRepairRequestSettings}
              className="rounded-xl border border-orange-500 px-4 py-3 font-bold text-orange-400 hover:bg-orange-500 hover:text-black"
            >
              Save Repair Request
            </button>
          </div>

          {repairRequest && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select
                value={repairPriority}
                onChange={(e) =>
                  setRepairPriority(e.target.value)
                }
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
                onChange={(e) =>
                  setRepairNotes(e.target.value)
                }
                className="min-h-[90px] rounded-xl border border-slate-700 bg-slate-900 p-3 text-white md:col-span-2"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
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
            {savingTemplate
              ? "Saving..."
              : "Save to Library"}
          </button>

          <button
            onClick={deleteFinding}
            className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500"
          >
            Delete Finding
          </button>

          <FindingActions finding={finding} />
        </div>
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
          onClick={rewriteSofter}
          disabled={rewriting}
          className="rounded-xl bg-teal-600 px-5 py-2 font-bold text-white hover:bg-teal-500 disabled:opacity-60"
        >
          {rewriting
            ? "Rewriting..."
            : "AI Rewrite Softer"}
        </button>

        <button
          onClick={saveToLibrary}
          disabled={savingTemplate}
          className="rounded-xl border border-teal-500 px-5 py-2 font-bold text-teal-400 hover:bg-teal-500 hover:text-black"
        >
          {savingTemplate
            ? "Saving..."
            : "Save to Library"}
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