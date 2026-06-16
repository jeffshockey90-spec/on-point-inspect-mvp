"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import FastLinkButton from "./FastLinkButton";

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
  const router = useRouter();

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
  const [savingRepair, setSavingRepair] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [saveLabel, setSaveLabel] = useState("Save Finding");
  const [repairLabel, setRepairLabel] = useState("Save Repair Request");
  const [rewriteLabel, setRewriteLabel] = useState("AI Rewrite Softer");
  const [templateLabel, setTemplateLabel] = useState("Save to Library");
  const [deleteLabel, setDeleteLabel] = useState("Delete Finding");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  async function saveFinding() {
    if (saving) return;

    setSaving(true);
    setSaveLabel("Saving...");

    try {
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

      if (error) {
        setSaveLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setSaveLabel("Saved!");
      showMessage("success", "Finding saved.");
      setEditing(false);
      router.refresh();
    } catch (error: any) {
      setSaveLabel("Failed");
      showMessage("error", error?.message || "Failed to save finding.");
    } finally {
      window.setTimeout(() => {
        setSaving(false);
        setSaveLabel("Save Finding");
      }, 700);
    }
  }

  async function saveRepairRequestSettings() {
    if (savingRepair) return;

    setSavingRepair(true);
    setRepairLabel("Saving...");

    try {
      const { error } = await supabase
        .from("findings")
        .update({
          repair_request: repairRequest,
          repair_priority: repairPriority,
          repair_notes: repairNotes,
        })
        .eq("id", finding.id);

      if (error) {
        setRepairLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setRepairLabel("Saved!");
      showMessage("success", "Repair request saved.");
      router.refresh();
    } catch (error: any) {
      setRepairLabel("Failed");
      showMessage("error", error?.message || "Failed to save repair request.");
    } finally {
      window.setTimeout(() => {
        setSavingRepair(false);
        setRepairLabel("Save Repair Request");
      }, 700);
    }
  }

  async function rewriteSofter() {
    if (rewriting) return;

    setRewriting(true);
    setRewriteLabel("Rewriting...");

    try {
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

      if (!data.rewritten) {
        setRewriteLabel("Failed");
        showMessage("error", "Failed to rewrite finding");
        return;
      }

      setRewriteLabel("Saving Rewrite...");

      const { error } = await supabase
        .from("findings")
        .update({
          recommendation: data.rewritten,
        })
        .eq("id", finding.id);

      if (error) {
        setRewriteLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setRecommendation(data.rewritten);
      setRewriteLabel("Rewritten!");
      showMessage("success", "Finding rewritten.");
      router.refresh();
    } catch (error: any) {
      setRewriteLabel("Failed");
      showMessage("error", error?.message || "Failed to rewrite finding.");
    } finally {
      window.setTimeout(() => {
        setRewriting(false);
        setRewriteLabel("AI Rewrite Softer");
      }, 700);
    }
  }

  async function saveToLibrary() {
    if (savingTemplate) return;

    if (!title.trim()) {
      showMessage("error", "Add a title before saving.");
      return;
    }

    setSavingTemplate(true);
    setTemplateLabel("Saving...");

    try {
      const { error } = await supabase.from("comment_library").insert({
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
        tags: `${section}, ${severity}`,
      });

      if (error) {
        setTemplateLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setTemplateLabel("Saved!");
      showMessage("success", "Saved to comment library.");
    } catch (error: any) {
      setTemplateLabel("Failed");
      showMessage("error", error?.message || "Failed to save to library.");
    } finally {
      window.setTimeout(() => {
        setSavingTemplate(false);
        setTemplateLabel("Save to Library");
      }, 700);
    }
  }

  async function deleteFinding() {
    if (deleting) return;

    const confirmed = confirm("Delete this finding?");
    if (!confirmed) return;

    setDeleting(true);
    setDeleteLabel("Deleting...");

    try {
      const { error } = await supabase
        .from("findings")
        .delete()
        .eq("id", finding.id);

      if (error) {
        setDeleteLabel("Failed");
        showMessage("error", error.message);
        return;
      }

      setDeleteLabel("Deleted!");
      showMessage("success", "Finding deleted.");
      router.refresh();
    } catch (error: any) {
      setDeleteLabel("Failed");
      showMessage("error", error?.message || "Failed to delete finding.");
    } finally {
      window.setTimeout(() => {
        setDeleting(false);
        setDeleteLabel("Delete Finding");
      }, 700);
    }
  }

  function Spinner({ active }: { active: boolean }) {
    if (!active) return null;

    return (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    );
  }

  if (!editing) {
    return (
      <div className="mt-6 w-full max-w-full space-y-5 overflow-hidden print:hidden">
        <InlineStatusMessage type={messageType} message={message} />
        <div className="w-full max-w-full overflow-hidden rounded-2xl border border-teal-700 bg-gradient-to-r from-[#052b2b] to-[#071b35] p-4 sm:p-5">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-teal-300">
            AI / Repair Request Tools
          </h4>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={rewriteSofter}
              disabled={rewriting}
              aria-busy={rewriting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
            >
              <Spinner active={rewriting} />
              {rewriteLabel}
            </button>

            <button
              type="button"
              onClick={() => setRepairRequest(!repairRequest)}
              disabled={savingRepair}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
            >
              {repairRequest ? "Remove From Request" : "Add To Repair Request"}
            </button>

            <button
              type="button"
              onClick={saveRepairRequestSettings}
              disabled={savingRepair}
              aria-busy={savingRepair}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500 px-5 py-3 text-sm font-bold text-orange-400 transition active:scale-[0.98] hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
            >
              <Spinner active={savingRepair} />
              {repairLabel}
            </button>
          </div>

          {repairRequest && (
            <div className="mt-4 grid w-full max-w-full gap-3 md:grid-cols-2">
              <select
                value={repairPriority}
                onChange={(e) => setRepairPriority(e.target.value)}
                disabled={savingRepair}
                className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={savingRepair}
                className="min-h-[90px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3 text-white disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
              />
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98] hover:bg-cyan-400 sm:w-auto [touch-action:manipulation]"
          >
            Edit Finding
          </button>

          <button
            type="button"
            onClick={saveToLibrary}
            disabled={savingTemplate}
            aria-busy={savingTemplate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-5 py-3 text-sm font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            <Spinner active={savingTemplate} />
            {templateLabel}
          </button>

          <button
            type="button"
            onClick={deleteFinding}
            disabled={deleting}
            aria-busy={deleting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
          >
            <Spinner active={deleting} />
            {deleteLabel}
          </button>

          <FastLinkButton
            href={`/ai-capture?inspection_id=${finding.inspection_id}`}
            loadingText="Opening AI Capture..."
            className="w-full rounded-xl border border-blue-500 bg-blue-500/10 px-5 py-3 text-center text-sm font-bold text-blue-300 hover:bg-blue-500/20 sm:w-auto"
          >
            Add Photos
          </FastLinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 w-full max-w-full space-y-4 overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] p-4 print:hidden sm:p-5">
      <InlineStatusMessage type={messageType} message={message} />
      <Input label="Title" value={title} onChange={setTitle} disabled={saving} />

      <div className="grid w-full max-w-full gap-4 md:grid-cols-2">
        <Select
          label="Section"
          value={section}
          onChange={setSection}
          options={SECTIONS}
          disabled={saving}
        />

        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={SEVERITIES}
          disabled={saving}
        />
      </div>

      <Textarea
        label="Observation"
        value={observation}
        onChange={setObservation}
        disabled={saving}
      />

      <Textarea
        label="Implication"
        value={implication}
        onChange={setImplication}
        disabled={saving}
      />

      <Textarea
        label="Recommendation"
        value={recommendation}
        onChange={setRecommendation}
        disabled={saving}
      />

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={saveFinding}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
        >
          <Spinner active={saving} />
          {saveLabel}
        </button>

        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function InlineStatusMessage({
  type,
  message,
}: {
  type: "success" | "error" | "";
  message: string;
}) {
  if (!message) return null;

  const isSuccess = type === "success";

  return (
    <div
      className={`rounded-xl border p-3 text-sm font-bold ${
        isSuccess
          ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
          : "border-red-500 bg-red-950/30 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full min-w-0 rounded-lg border border-slate-700 bg-black p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full min-w-0 rounded-lg border border-slate-700 bg-black p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-slate-300">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        disabled={disabled}
        className="w-full min-w-0 rounded-lg border border-slate-700 bg-black p-3 leading-7 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}
