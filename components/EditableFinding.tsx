"use client";

import { memo, useRef, useState } from "react";
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

function EditableFinding({ finding }: { finding: any }) {
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
  const [movePanelOpen, setMovePanelOpen] = useState(false);
  const [movingSection, setMovingSection] = useState(false);
  const [moveTargetSection, setMoveTargetSection] = useState(
    finding.section || "Exterior",
  );

  const [saveLabel, setSaveLabel] = useState("Save Finding");
  const [repairLabel, setRepairLabel] = useState("Save Repair Request");
  const [rewriteLabel, setRewriteLabel] = useState("AI Rewrite Softer");
  const [templateLabel, setTemplateLabel] = useState("Save to Library");
  const [deleteLabel, setDeleteLabel] = useState("Delete Finding");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const learningBaselineRef = useRef({
    title: finding.title || "",
    section: finding.section || "",
    severity: finding.severity || "",
    observation: finding.observation || "",
    implication: finding.implication || "",
    recommendation: finding.recommendation || "",
  });

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

      const updatedLearningValue = {
        title,
        section,
        severity,
        observation,
        implication,
        recommendation,
      };
      const originalLearningValue = learningBaselineRef.current;
      const hasInspectorChanges =
        JSON.stringify(originalLearningValue) !==
        JSON.stringify(updatedLearningValue);

      if (hasInspectorChanges) {
        try {
          await fetch("/api/ai/learning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inspectionId: finding.inspection_id,
              tool: "editable_finding",
              original: originalLearningValue,
              updated: updatedLearningValue,
              accepted: true,
              notes:
                "Inspector edited a finding. Learn wording, severity, and section-routing preferences from the exact before/after values.",
            }),
          });
        } catch {
          // Learning must never block saving a finding.
        }
      }

      learningBaselineRef.current = updatedLearningValue;

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

  async function moveFindingToSection() {
    if (movingSection) return;

    const nextSection = String(moveTargetSection || "").trim();
    const currentSection = String(finding.section || section || "").trim();

    if (!nextSection) {
      showMessage("error", "Choose a section first.");
      return;
    }

    if (nextSection === currentSection) {
      setMovePanelOpen(false);
      showMessage("success", `Finding is already in ${nextSection}.`);
      return;
    }

    setMovingSection(true);

    try {
      const { error } = await supabase
        .from("findings")
        .update({ section: nextSection })
        .eq("id", finding.id)
        .eq("inspection_id", finding.inspection_id);

      if (error) {
        showMessage("error", error.message);
        return;
      }

      setSection(nextSection);
      setMovePanelOpen(false);
      showMessage("success", `Finding moved to ${nextSection}.`);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("opi:findings-changed", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              findingId: String(finding.id || ""),
              section: nextSection,
              previousSection: currentSection,
              action: "moved",
            },
          }),
        );

        window.dispatchEvent(
          new CustomEvent("opi:inspection-data-changed", {
            detail: {
              inspectionId: String(finding.inspection_id || ""),
              source: "move-finding-section",
            },
          }),
        );
      }

      router.refresh();
    } catch (error: any) {
      showMessage(
        "error",
        error?.message || "Failed to move finding to the selected section.",
      );
    } finally {
      setMovingSection(false);
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
      <div className="mt-3 w-full max-w-full space-y-3 overflow-hidden print:hidden">
        <InlineStatusMessage type={messageType} message={message} />
        <div className="w-full max-w-full overflow-hidden rounded-2xl border border-teal-700 bg-gradient-to-r from-[#052b2b] to-[#071b35] p-3 sm:p-5">
          <h4 className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-teal-300 sm:text-sm">
            Quick Tools
          </h4>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={rewriteSofter}
              disabled={rewriting}
              aria-busy={rewriting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-3 py-3 text-xs font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
            >
              <Spinner active={rewriting} />
              {rewriteLabel}
            </button>

            <button
              type="button"
              onClick={() => setRepairRequest(!repairRequest)}
              disabled={savingRepair}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-xs font-black text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
            >
              {repairRequest ? "Remove From Request" : "Add To Repair Request"}
            </button>

            <button
              type="button"
              onClick={saveRepairRequestSettings}
              disabled={savingRepair}
              aria-busy={savingRepair}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500 px-3 py-3 text-xs font-black text-orange-400 transition active:scale-[0.98] hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
            >
              <Spinner active={savingRepair} />
              {repairLabel}
            </button>
          </div>

          {repairRequest && (
            <div className="mt-3 grid w-full max-w-full gap-2 md:grid-cols-2">
              <select
                value={repairPriority}
                onChange={(e) => setRepairPriority(e.target.value)}
                disabled={savingRepair}
                className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                className="min-h-[76px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-bold leading-6 text-white disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
              />
            </div>
          )}
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-3 text-xs font-black text-slate-950 transition active:scale-[0.98] hover:bg-cyan-400 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
          >
            Edit Finding
          </button>

          <button
            type="button"
            onClick={() => {
              setMoveTargetSection(String(finding.section || section || "Exterior"));
              setMovePanelOpen((current) => !current);
            }}
            disabled={movingSection}
            aria-expanded={movePanelOpen}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 bg-purple-500/10 px-3 py-3 text-xs font-black text-purple-200 transition active:scale-[0.98] hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
          >
            <Spinner active={movingSection} />
            {movingSection ? "Moving..." : "Move Finding"}
          </button>

          <button
            type="button"
            onClick={saveToLibrary}
            disabled={savingTemplate}
            aria-busy={savingTemplate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-3 py-3 text-xs font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
          >
            <Spinner active={savingTemplate} />
            {templateLabel}
          </button>

          <button
            type="button"
            onClick={deleteFinding}
            disabled={deleting}
            aria-busy={deleting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-3 text-xs font-black text-white transition active:scale-[0.98] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm [touch-action:manipulation]"
          >
            <Spinner active={deleting} />
            {deleteLabel}
          </button>

          <FastLinkButton
            href={`/ai-capture?inspection_id=${finding.inspection_id}`}
            loadingText="Opening AI Capture..."
            className="w-full rounded-xl border border-blue-500 bg-blue-500/10 px-3 py-3 text-center text-xs font-black text-blue-300 transition active:scale-[0.98] hover:bg-blue-500/20 sm:w-auto sm:px-5 sm:text-sm"
          >
            Add Photos
          </FastLinkButton>
        </div>

        {movePanelOpen && (
          <div className="w-full max-w-full rounded-2xl border border-purple-500/60 bg-purple-950/20 p-3 shadow-xl sm:p-4">
            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                Move Finding
              </p>
              <p className="mt-1 text-sm font-bold text-slate-300">
                Current section: {String(finding.section || section || "Unknown")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Photos, videos, wording, severity, and repair-request settings stay attached.
              </p>
            </div>

            <select
              value={moveTargetSection}
              onChange={(event) => setMoveTargetSection(event.target.value)}
              disabled={movingSection}
              className="min-h-[48px] w-full rounded-xl border border-purple-500/50 bg-slate-950 p-3 text-base font-black text-white outline-none focus:border-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {SECTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={moveFindingToSection}
                disabled={
                  movingSection ||
                  !moveTargetSection ||
                  moveTargetSection === String(finding.section || section || "")
                }
                aria-busy={movingSection}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                <Spinner active={movingSection} />
                {movingSection ? "Moving..." : "Move Now"}
              </button>

              <button
                type="button"
                onClick={() => setMovePanelOpen(false)}
                disabled={movingSection}
                className="min-h-[46px] rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 w-full max-w-full space-y-3 overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] p-3 print:hidden sm:p-5">
      <InlineStatusMessage type={messageType} message={message} />
      <Input label="Title" value={title} onChange={setTitle} disabled={saving} />

      <div className="grid w-full max-w-full gap-3 md:grid-cols-2">
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

      <div className="sticky bottom-2 z-30 grid w-full grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-[#111827]/95 p-2 shadow-2xl backdrop-blur sm:static sm:flex sm:flex-row sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <button
          type="button"
          onClick={saveFinding}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
        >
          <Spinner active={saving} />
          {saveLabel}
        </button>

        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation]"
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
        className="min-h-[46px] w-full min-w-0 rounded-xl border border-slate-700 bg-black p-3 text-base font-bold text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
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
        className="min-h-[46px] w-full min-w-0 rounded-xl border border-slate-700 bg-black p-3 text-base font-bold text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
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
        rows={4}
        disabled={disabled}
        className="w-full min-w-0 rounded-xl border border-slate-700 bg-black p-3 text-base font-bold leading-7 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export default memo(EditableFinding);
