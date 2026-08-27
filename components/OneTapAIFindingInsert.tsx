"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { supabase } from "../lib/supabaseClient";
import AITemplateSuggestions from "./AITemplateSuggestions";

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
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Maintenance",
  "Monitor",
  "Informational",
];

type Props = {
  inspectionId: string;
};

type MessageType = "success" | "error" | "info" | "";

export default function OneTapAIFindingInsert({ inspectionId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const isVideo = file?.type.startsWith("video/") || false;
  const isImage = file?.type.startsWith("image/") || false;
  const [inspectorNote, setInspectorNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [inspectorId, setInspectorId] = useState("");

  // Snapshot of the AI draft, captured the moment /api/ai-photo-finding returns
  // — before any inspector edit — so the learning brain can diff the AI draft
  // against what actually gets inserted (identical is still a positive signal).
  const oneTapDraftBaselineRef = useRef<{
    title: string;
    section: string;
    severity: string;
    observation: string;
    implication: string;
    recommendation: string;
  } | null>(null);

  const busy = loading || saving || isRefreshing;

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessageType("");
    setMessage("");
  }

  async function loadInspector() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      setInspectorId(user.id);
    }
  }

  function resetForm() {
    setFile(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl("");
    setInspectorNote("");
    setLoading(false);
    setSaving(false);
    setSaved(false);
    clearMessage();
    setTitle("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setObservation("");
    setImplication("");
    setRecommendation("");
    oneTapDraftBaselineRef.current = null;
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    resetForm();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];

    if (!selected || busy) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    setSaved(false);
    clearMessage();
    setPreviewUrl(URL.createObjectURL(selected));

    if (selected.type.startsWith("video/")) {
      setTitle((current) => current || "Video Attachment");
      setSeverity("Informational");
      setObservation(
        (current) =>
          current ||
          "Video media was added to document the condition observed at the time of inspection."
      );
      setImplication(
        (current) =>
          current ||
          "Video is provided for client reference and additional visual context."
      );
      setRecommendation(
        (current) =>
          current ||
          "Review the attached video along with the written finding. Further evaluation or repair should be performed by the appropriate qualified contractor if concerns are present."
      );
      showMessage(
        "info",
        "Video selected. It can be saved to the report, but AI analysis is photo-only."
      );
    } else {
      showMessage("info", "Photo selected. You can analyze it or manually complete the finding.");
    }
  }

  async function analyzePhoto() {
    if (busy) return;

    if (!file) {
      showMessage("error", "Please select a photo first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showMessage(
        "error",
        "AI analysis works with photos only. Videos can still be saved to the report."
      );
      return;
    }

    setLoading(true);
    setSaved(false);
    showMessage("info", "Analyzing photo...");

    try {
      const base64 = await fileToBase64(file);

      const res = await fetch("/api/ai-photo-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mode: "inspection",
          inspectorNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI analysis failed.");
      }

      setTitle(data.title || "");
      setSection(data.section || "Exterior");
      setSeverity(data.severity || "Recommended Repair");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");

      // Capture the AI draft exactly as generated (pre-edit) for learning.
      oneTapDraftBaselineRef.current = {
        title: data.title || "",
        section: data.section || "Exterior",
        severity: data.severity || "Recommended Repair",
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
      };

      showMessage("success", "AI draft ready. Review and edit before inserting.");
    } catch (error: any) {
      showMessage(
        "error",
        error?.message || "Something went wrong analyzing the photo."
      );
    } finally {
      setLoading(false);
    }
  }

  async function insertFinding() {
    if (busy) return;

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    if (!title.trim()) {
      showMessage("error", "Finding title is required.");
      return;
    }

    setSaving(true);
    setSaved(false);
    showMessage("info", "Inserting finding into report...");

    try {
      let imageUrl = "";
      let filePath = "";

      if (file) {
        const fileExt = file.name.split(".").pop() || "jpg";
        filePath = `${inspectionId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(filePath);

        imageUrl = data.publicUrl;
      }

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title,
          section,
          severity,
          observation,
          implication,
          recommendation,
          image_url: file?.type.startsWith("image/") ? imageUrl : "",
        })
        .select()
        .single();

      if (error) throw error;

      if (file && findingData) {
        const { error: photoError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: findingData.id,
          public_url: imageUrl,
          file_path: filePath,
        });

        if (photoError) throw photoError;
      }

      setSaved(true);
      showMessage("success", "Finding inserted successfully.");

      // Teach the per-inspector learning brain from the AI draft vs. what was
      // actually inserted. Identical values are still a positive accept signal.
      // Fire-and-forget; must never block or break the insert.
      const oneTapBaseline = oneTapDraftBaselineRef.current;
      if (oneTapBaseline) {
        try {
          await fetch("/api/ai/learning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inspectionId,
              tool: "one_tap",
              original: oneTapBaseline,
              updated: {
                title,
                section,
                severity,
                observation,
                implication,
                recommendation,
              },
              accepted: true,
              notes:
                "Inspector accepted an AI-generated finding. Learn wording, severity, and section-routing preferences from the before/after.",
            }),
          });
        } catch {
          // Learning must never block saving.
        }
        oneTapDraftBaselineRef.current = null;
      }

      startTransition(() => {
        router.refresh();
      });

      window.setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 850);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to insert finding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (busy) return;
          setOpen(true);
          clearMessage();
          loadInspector();
        }}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-400 bg-teal-500/10 px-5 py-3 font-bold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {isRefreshing && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {isRefreshing ? "Updating..." : "⚡ One-Tap AI Finding"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4">
          <div className="my-8 w-full max-w-5xl rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 text-[var(--fl-text)] shadow-2xl md:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
                  FLOW AI
                </p>

                <h2 className="mt-2 text-3xl font-extrabold">
                  One-Tap AI Finding
                </h2>

                <p className="mt-2 text-sm text-[var(--fl-muted)]">
                  Upload a photo, let AI draft the finding, review it, then insert it directly into this report.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="rounded-xl border border-[var(--fl-line)] px-4 py-2 font-bold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                Close
              </button>
            </div>

            {message && (
              <div
                className={`mb-5 rounded-xl border p-4 text-sm font-bold ${
                  messageType === "success"
                    ? "border-emerald-500 bg-emerald-500/10 text-[var(--fl-good-text)]"
                    : messageType === "error"
                      ? "border-red-500 bg-red-500/10 text-[var(--fl-crit-text)]"
                      : "border-cyan-500 bg-cyan-500/10 text-[var(--fl-info-text)]"
                }`}
              >
                {message}
              </div>
            )}

            <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-5">
              <h3 className="mb-4 text-xl font-bold text-[var(--fl-accent-text)]">
                Photo
              </h3>

              <MediaUploadButtons onChange={handleFileChange} disabled={busy} />

              {previewUrl && isImage && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mt-5 max-h-[420px] w-full rounded-xl border border-[var(--fl-line)] object-contain"
                />
              )}

              {previewUrl && isVideo && (
                <video
                  src={previewUrl}
                  controls
                  className="mt-5 max-h-[420px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
                />
              )}

              {file && (
                <p className="mt-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-muted)]">
                  Selected: {file.name} {isVideo ? "• Video will be saved as report media. AI analysis is photo-only." : ""}
                </p>
              )}

              <textarea
                value={inspectorNote}
                onChange={(e) => setInspectorNote(e.target.value)}
                rows={3}
                placeholder="Optional note for AI... Example: damaged roof panel, loose toilet, water stain under sink, missing GFCI, etc."
                disabled={busy}
                className="mt-5 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="button"
                onClick={analyzePhoto}
                disabled={busy || isVideo}
                aria-busy={loading}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-extrabold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {loading ? "Analyzing..." : isVideo ? "Videos Cannot Be Analyzed" : "Analyze Photo"}
              </button>
            </section>

            <section className="mt-5 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-5">
              <h3 className="mb-4 text-xl font-bold text-[var(--fl-accent-text)]">
                Review Finding
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Finding title"
                  disabled={busy}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  disabled={busy}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {SECTIONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>

                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  disabled={busy}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                >
                  {SEVERITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <FieldTextArea
                label="Observation"
                value={observation}
                onChange={setObservation}
                disabled={busy}
              />

              <FieldTextArea
                label="Implication"
                value={implication}
                onChange={setImplication}
                disabled={busy}
              />

              <FieldTextArea
                label="Recommendation"
                value={recommendation}
                onChange={setRecommendation}
                disabled={busy}
              />

              <AITemplateSuggestions
                title={title}
                observation={observation}
                inspectorId={inspectorId}
                onUseTemplate={(template) => {
                  if (busy) return;
                  clearMessage();
                  // Applying a library template replaces the AI draft, so it is
                  // no longer an AI-draft acceptance — drop the learning baseline.
                  oneTapDraftBaselineRef.current = null;
                  setTitle(template.title || "");
                  setSection(template.section || "Exterior");
                  setSeverity(template.severity || "Recommended Repair");
                  setObservation(template.observation || "");
                  setImplication(template.implication || "");
                  setRecommendation(template.recommendation || "");
                }}
              />

              <button
                type="button"
                onClick={insertFinding}
                disabled={busy}
                aria-busy={saving || isRefreshing}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                {(saving || isRefreshing) && (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {saving
                  ? "Inserting..."
                  : isRefreshing
                    ? "Updating Report..."
                    : saved
                      ? "Finding Inserted"
                      : "Insert Finding Into Report"}
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function MediaUploadButtons({
  onChange,
  disabled,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className={`rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        📷 Take Photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>

      <label className={`rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        🖼 Choose Photo
        <input
          type="file"
          accept="image/*"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>

      <label className={`rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white [touch-action:manipulation] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        🎥 Choose Video
        <input
          type="file"
          accept="video/*"
          onChange={onChange}
          disabled={disabled}
          className="hidden"
        />
      </label>
    </div>
  );
}

function FieldTextArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}
