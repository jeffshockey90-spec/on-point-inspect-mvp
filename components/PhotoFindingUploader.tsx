"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  inspectionId: string;
  sections: string[];
  onSaved?: () => void;
};

type MessageType = "success" | "error" | "info" | "";

export default function PhotoFindingUploader({
  inspectionId,
  sections,
  onSaved,
}: Props) {
  const [selectedSection, setSelectedSection] = useState(sections[0] || "");
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const busy = loading || saving;

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessage("");
    setMessageType("");
  }

  async function handlePhotoUpload(file: File) {
    if (busy) return;

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    clearMessage();
    setLoading(true);
    showMessage("info", "Uploading and analyzing photo...");

    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${inspectionId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;
      setImageUrl(publicUrl);
      showMessage("info", "Photo uploaded. AI is drafting the finding...");

      const aiRes = await fetch("/api/ai-photo-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      const aiData = await aiRes.json().catch(() => ({}));

      if (!aiRes.ok) {
        throw new Error(aiData.error || "AI failed to analyze the photo.");
      }

      setTitle(aiData.title || "");
      setObservation(aiData.observation || "");
      setImplication(aiData.implication || "");
      setRecommendation(aiData.recommendation || "");
      showMessage("success", "AI finding drafted. Review it, then save it to the report.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to upload or analyze photo.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFinding() {
    if (busy) return;

    if (!selectedSection) {
      showMessage("error", "Select a section first.");
      return;
    }

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    setSaving(true);
    showMessage("info", "Saving finding...");

    try {
      const { error } = await supabase.from("report_findings").insert({
        inspection_id: inspectionId,
        section: selectedSection,
        image_url: imageUrl,
        title,
        observation,
        implication,
        recommendation,
      });

      if (error) throw error;

      setImageUrl("");
      setTitle("");
      setObservation("");
      setImplication("");
      setRecommendation("");
      showMessage("success", "Finding saved.");

      if (onSaved) onSaved();
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save finding.");
    } finally {
      window.setTimeout(() => {
        setSaving(false);
      }, 500);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-4">
      <h2 className="text-xl font-semibold">Add Photo Finding</h2>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            messageType === "success"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : messageType === "info"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-red-500 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <div>
        <label className="mb-1 block font-medium">Report Section</label>
        <select
          className="w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
          value={selectedSection}
          onChange={(e) => setSelectedSection(e.target.value)}
          disabled={busy}
        >
          {sections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-medium">Take or Upload Photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoUpload(file);
            e.currentTarget.value = "";
          }}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {loading && (
        <p className="inline-flex items-center gap-2 font-bold text-slate-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Analyzing photo...
        </p>
      )}

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Inspection finding"
          className="w-full max-w-md rounded-lg border"
        />
      )}

      <input
        className="w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
      />

      <textarea
        className="w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Observation"
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
        disabled={busy}
      />

      <textarea
        className="w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Implication"
        value={implication}
        onChange={(e) => setImplication(e.target.value)}
        disabled={busy}
      />

      <textarea
        className="w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Recommendation"
        value={recommendation}
        onChange={(e) => setRecommendation(e.target.value)}
        disabled={busy}
      />

      <button
        type="button"
        onClick={saveFinding}
        disabled={busy}
        aria-busy={saving}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {saving && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {saving ? "Saving..." : "Save Finding"}
      </button>
    </div>
  );
}
