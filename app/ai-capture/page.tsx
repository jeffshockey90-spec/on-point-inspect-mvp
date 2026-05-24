"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

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

export default function AICapturePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">Loading...</main>}>
      <AICaptureContent />
    </Suspense>
  );
}

function AICaptureContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id") || "";

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

  const [equipmentType, setEquipmentType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [estimatedAge, setEstimatedAge] = useState("");
  const [notes, setNotes] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function analyzeImage() {
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

      setEquipmentType(data.equipment_type || "");
      setManufacturer(data.manufacturer || "");
      setModelNumber(data.model_number || "");
      setSerialNumber(data.serial_number || "");
      setEstimatedAge(data.estimated_age || "");
      setNotes(data.notes || "");
    } catch (error: any) {
      alert(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFinding() {
    if (!inspectionId) {
      alert("Missing inspection ID. Open AI Capture from inside a report.");
      return;
    }

    if (!title.trim()) {
      alert("Finding title is required.");
      return;
    }

    setSaving(true);

    try {
      let imageUrl = "";

      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${inspectionId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(fileName);

        imageUrl = data.publicUrl;
      }

      const fullRecommendation = [
        recommendation,
        equipmentType ? `\n\nEquipment Type: ${equipmentType}` : "",
        manufacturer ? `Manufacturer: ${manufacturer}` : "",
        modelNumber ? `Model Number: ${modelNumber}` : "",
        serialNumber ? `Serial Number: ${serialNumber}` : "",
        estimatedAge ? `Estimated Age: ${estimatedAge}` : "",
        notes ? `Additional Notes: ${notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase.from("findings").insert({
        inspection_id: inspectionId,
        title,
        section,
        severity,
        observation,
        implication,
        recommendation: fullRecommendation,
        image_url: imageUrl,
      });

      if (error) throw error;

      window.location.assign(`/reports/${inspectionId}`);
    } catch (error: any) {
      alert(error.message || "Failed to save finding.");
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-teal-400">
              On Point AI
            </p>

            <h1 className="mt-2 text-4xl font-extrabold">AI Capture</h1>

            <p className="mt-3 max-w-2xl text-slate-300">
              Upload inspection photos, add your field note, and generate report-ready findings.
            </p>
          </div>

          <Link
            href={inspectionId ? `/reports/${inspectionId}` : "/reports"}
            className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back To Report
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">Upload Photo</h2>

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
              className="mt-5 max-h-[450px] w-full rounded-xl border border-slate-700 object-contain"
            />
          )}

          <textarea
            value={inspectorNote}
            onChange={(e) => setInspectorNote(e.target.value)}
            rows={4}
            placeholder="Optional note for AI... Example: loose toilet, damaged shingles, water staining under sink, missing GFCI, etc."
            className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
          />

          <button
            onClick={analyzeImage}
            disabled={loading}
            className="mt-5 rounded-xl bg-teal-500 px-6 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze Photo"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">AI Finding</h2>

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

          <TextArea label="Observation" value={observation} onChange={setObservation} />
          <TextArea label="Implication" value={implication} onChange={setImplication} />
          <TextArea label="Recommendation" value={recommendation} onChange={setRecommendation} />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Equipment Recognition
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Equipment Type" value={equipmentType} onChange={setEquipmentType} />
            <Input label="Manufacturer" value={manufacturer} onChange={setManufacturer} />
            <Input label="Model Number" value={modelNumber} onChange={setModelNumber} />
            <Input label="Serial Number" value={serialNumber} onChange={setSerialNumber} />
            <Input label="Estimated Age" value={estimatedAge} onChange={setEstimatedAge} />
          </div>

          <TextArea label="Equipment Notes" value={notes} onChange={setNotes} />
        </section>

        <button
          onClick={saveFinding}
          disabled={saving}
          className="w-full rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-black transition hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Finding to Report"}
        </button>
      </div>
    </main>
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
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

function TextArea({
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
        rows={5}
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