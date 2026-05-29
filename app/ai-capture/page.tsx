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
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
          Loading...
        </main>
      }
    >
      <AICaptureContent />
    </Suspense>
  );
}

function AICaptureContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id") || "";

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const isVideo = file?.type.startsWith("video/") || false;
  const isImage = file?.type.startsWith("image/") || false;
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

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));

    if (selected.type.startsWith("video/")) {
      setTitle((current) => current || "Video Attachment");
      setSeverity("Informational");
      setObservation((current) => current || "Video media was added to document the condition observed at the time of inspection.");
      setImplication((current) => current || "Video is provided for client reference and additional visual context.");
      setRecommendation((current) => current || "Review the attached video along with the written finding. Further evaluation or repair should be performed by the appropriate qualified contractor if concerns are present.");
    }
  }

  async function analyzeImage() {
    if (!file) {
      alert("Please select a photo first.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("AI analysis works with photos only. Videos can be saved to the report, but they cannot be analyzed yet.");
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
      let filePath = "";

      if (file) {
        const fileExt = file.name.split(".").pop();

        filePath = `${inspectionId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(filePath);

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

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title,
          section,
          severity,
          observation,
          implication,
          recommendation: fullRecommendation,
          image_url: file?.type.startsWith("image/") ? imageUrl : "",
        })
        .select()
        .single();

      if (error) throw error;

      if (file && findingData) {
        const { error: photoError } = await supabase
          .from("photos")
          .insert({
            inspection_id: inspectionId,
            finding_id: findingData.id,
            public_url: imageUrl,
            file_path: filePath,
          });

        if (photoError) throw photoError;
      }

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

            <h1 className="mt-2 text-4xl font-extrabold">
              AI Capture
            </h1>

            <p className="mt-3 max-w-2xl text-slate-300">
              Upload inspection photos, add your field note, and
              generate report-ready findings.
            </p>
          </div>

          <Link
            href={
              inspectionId
                ? `/reports/${inspectionId}`
                : "/reports"
            }
            className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back To Report
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Upload Photo
          </h2>

          <MediaUploadButtons onChange={handleFileChange} />

          {previewUrl && isImage && (
            <img
              src={previewUrl}
              alt="Preview"
              className="mt-5 max-h-[450px] w-full rounded-xl border border-slate-700 object-contain"
            />
          )}

          {previewUrl && isVideo && (
            <video
              src={previewUrl}
              controls
              className="mt-5 max-h-[450px] w-full rounded-xl border border-slate-700 bg-black"
            />
          )}

          {file && (
            <p className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
              Selected: {file.name} {isVideo ? "• Video will be saved as report media. AI analysis is photo-only." : ""}
            </p>
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
            {loading ? "Analyzing..." : isVideo ? "Videos Cannot Be Analyzed" : "Analyze Photo"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            AI Finding
          </h2>

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

          <TextArea
            label="Observation"
            value={observation}
            onChange={setObservation}
          />

          <TextArea
            label="Implication"
            value={implication}
            onChange={setImplication}
          />

          <TextArea
            label="Recommendation"
            value={recommendation}
            onChange={setRecommendation}
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Equipment Recognition
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Equipment Type"
              value={equipmentType}
              onChange={setEquipmentType}
            />

            <Input
              label="Manufacturer"
              value={manufacturer}
              onChange={setManufacturer}
            />

            <Input
              label="Model Number"
              value={modelNumber}
              onChange={setModelNumber}
            />

            <Input
              label="Serial Number"
              value={serialNumber}
              onChange={setSerialNumber}
            />

            <Input
              label="Estimated Age"
              value={estimatedAge}
              onChange={setEstimatedAge}
            />
          </div>

          <TextArea
            label="Equipment Notes"
            value={notes}
            onChange={setNotes}
          />
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


function MediaUploadButtons({
  onChange,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 hover:bg-teal-500 hover:text-black">
        📷 Take Photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black">
        🖼 Choose Photo
        <input
          type="file"
          accept="image/*"
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 hover:bg-purple-500 hover:text-white">
        🎥 Choose Video
        <input
          type="file"
          accept="video/*"
          onChange={onChange}
          className="hidden"
        />
      </label>
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

    reader.onload = () =>
      resolve(reader.result as string);

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}