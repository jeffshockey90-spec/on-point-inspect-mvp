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

export default function OneTapAIFindingInsert({ inspectionId }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [inspectorNote, setInspectorNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  function resetForm() {
    setFile(null);
    setPreviewUrl("");
    setInspectorNote("");
    setLoading(false);
    setSaving(false);
    setTitle("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setObservation("");
    setImplication("");
    setRecommendation("");
  }

  function closeModal() {
    if (loading || saving) return;
    setOpen(false);
    resetForm();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];

    if (!selected) return;

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function analyzePhoto() {
    if (!file) {
      alert("Please select a photo first.");
      return;
    }

    setLoading(true);

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
    } catch (error: any) {
      alert(error.message || "Something went wrong analyzing the photo.");
    } finally {
      setLoading(false);
    }
  }

  async function insertFinding() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    if (!title.trim()) {
      alert("Finding title is required.");
      return;
    }

    setSaving(true);

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
          image_url: imageUrl,
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

      window.location.reload();
    } catch (error: any) {
      alert(error.message || "Failed to insert finding.");
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-teal-400 bg-teal-500/10 px-5 py-3 font-bold text-teal-300 transition hover:bg-teal-500 hover:text-black"
      >
        ⚡ One-Tap AI Finding
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4">
          <div className="my-8 w-full max-w-5xl rounded-2xl border border-slate-700 bg-[#0b1220] p-5 text-white shadow-2xl md:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  On Point AI
                </p>

                <h2 className="mt-2 text-3xl font-extrabold">
                  One-Tap AI Finding
                </h2>

                <p className="mt-2 text-sm text-slate-300">
                  Upload a photo, let AI draft the finding, review it, then insert it directly into this report.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={loading || saving}
                className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <h3 className="mb-4 text-xl font-bold text-teal-400">
                Photo
              </h3>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"
              />

              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mt-5 max-h-[420px] w-full rounded-xl border border-slate-700 object-contain"
                />
              )}

              <textarea
                value={inspectorNote}
                onChange={(e) => setInspectorNote(e.target.value)}
                rows={3}
                placeholder="Optional note for AI... Example: damaged roof panel, loose toilet, water stain under sink, missing GFCI, etc."
                className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={analyzePhoto}
                disabled={loading || saving}
                className="mt-5 rounded-xl bg-teal-500 px-6 py-3 font-extrabold text-black transition hover:bg-teal-400 disabled:opacity-50"
              >
                {loading ? "Analyzing..." : "Analyze Photo"}
              </button>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <h3 className="mb-4 text-xl font-bold text-teal-400">
                Review Finding
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Finding title"
                  className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />

                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                >
                  {SECTIONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>

                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400 md:col-span-2"
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
              />

              <FieldTextArea
                label="Implication"
                value={implication}
                onChange={setImplication}
              />

              <FieldTextArea
                label="Recommendation"
                value={recommendation}
                onChange={setRecommendation}
              />

              <button
                type="button"
                onClick={insertFinding}
                disabled={saving || loading}
                className="mt-6 w-full rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-black transition hover:bg-teal-400 disabled:opacity-50"
              >
                {saving ? "Inserting..." : "Insert Finding Into Report"}
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function FieldTextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
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
