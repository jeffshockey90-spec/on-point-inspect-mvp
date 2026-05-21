"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  inspectionId: string;
  sections: string[];
  onSaved?: () => void;
};

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

  async function handlePhotoUpload(file: File) {
    setLoading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${inspectionId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, file);

    if (uploadError) {
      alert(uploadError.message);
      setLoading(false);
      return;
    }

    const { data } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    const publicUrl = data.publicUrl;
    setImageUrl(publicUrl);

    const aiRes = await fetch("/api/ai-photo-comment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl: publicUrl }),
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      alert(aiData.error || "AI failed");
      setLoading(false);
      return;
    }

    setTitle(aiData.title || "");
    setObservation(aiData.observation || "");
    setImplication(aiData.implication || "");
    setRecommendation(aiData.recommendation || "");

    setLoading(false);
  }

  async function saveFinding() {
    if (!selectedSection) {
      alert("Select a section first");
      return;
    }

    const { error } = await supabase.from("report_findings").insert({
      inspection_id: inspectionId,
      section: selectedSection,
      image_url: imageUrl,
      title,
      observation,
      implication,
      recommendation,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setImageUrl("");
    setTitle("");
    setObservation("");
    setImplication("");
    setRecommendation("");

    if (onSaved) onSaved();

    alert("Finding saved");
  }

  return (
    <div className="border rounded-xl p-4 space-y-4 bg-white">
      <h2 className="text-xl font-semibold">Add Photo Finding</h2>

      <div>
        <label className="block font-medium mb-1">Report Section</label>
        <select
          className="border rounded-lg p-2 w-full"
          value={selectedSection}
          onChange={(e) => setSelectedSection(e.target.value)}
        >
          {sections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-medium mb-1">Take or Upload Photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoUpload(file);
          }}
        />
      </div>

      {loading && <p>Analyzing photo...</p>}

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Inspection finding"
          className="w-full max-w-md rounded-lg border"
        />
      )}

      <input
        className="border rounded-lg p-2 w-full"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="border rounded-lg p-2 w-full"
        placeholder="Observation"
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
      />

      <textarea
        className="border rounded-lg p-2 w-full"
        placeholder="Implication"
        value={implication}
        onChange={(e) => setImplication(e.target.value)}
      />

      <textarea
        className="border rounded-lg p-2 w-full"
        placeholder="Recommendation"
        value={recommendation}
        onChange={(e) => setRecommendation(e.target.value)}
      />

      <button
        onClick={saveFinding}
        className="bg-black text-white rounded-lg px-4 py-2"
      >
        Save Finding
      </button>
    </div>
  );
}