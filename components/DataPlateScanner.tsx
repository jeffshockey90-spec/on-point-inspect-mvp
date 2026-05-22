"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const SEVERITIES = [
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Monitor",
];

type DataPlateResult = {
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
};

export default function DataPlateScanner({ reportId }: { reportId: string }) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [equipmentType, setEquipmentType] = useState("HVAC");
  const [severity, setSeverity] = useState("Maintenance");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<DataPlateResult | null>(null);

  function handleFileChange(selectedFile: File | null) {
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setUploadedImageUrl("");
    setResult(null);
  }

  async function uploadImage() {
    if (!file) return "";

    const fileExt = file.name.split(".").pop();
    const fileName = `data-plate-${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, file);

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function scanDataPlate() {
    try {
      setLoading(true);

      let imageUrl = uploadedImageUrl;

      if (file && !imageUrl) {
        imageUrl = await uploadImage();
        setUploadedImageUrl(imageUrl);
      }

      const res = await fetch("/api/ai/finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
          section: equipmentType,
          note: `
This is a data plate / equipment label photo.

Selected severity: ${severity}

Analyze the visible information and create a professional home inspection report entry.

Include any visible:
- Manufacturer
- Model number
- Serial number
- Approximate age if determinable
- Fuel type or equipment type if visible
- Capacity or efficiency ratings if visible
- Any limitations if the label is blurry, obstructed, or unreadable

Do not guess if information is not visible.
`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Data plate scan failed");
      }

      setResult({
        title: data.title || "Equipment Data Plate",
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
      });
    } catch (error: any) {
      alert(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveToReport() {
    if (!result) return;

    try {
      setSaving(true);

      const { error } = await supabase.from("findings").insert({
        inspection_id: reportId,
        section: equipmentType,
        severity,
        title: result.title,
        observation: result.observation,
        implication: result.implication,
        recommendation: result.recommendation,
        image_url: uploadedImageUrl || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      setFile(null);
      setPreviewUrl("");
      setUploadedImageUrl("");
      setResult(null);
      setEquipmentType("HVAC");
      setSeverity("Maintenance");

      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to save data plate finding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-300 bg-gray-50 p-5 text-black">
      <h2 className="mb-2 text-2xl font-bold text-teal-700">
        Data Plate Scanner
      </h2>

      <p className="mb-4 text-sm text-gray-700">
        Take or upload a photo of an HVAC, water heater, appliance, or equipment
        data plate and let AI help read the visible information.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold">
            Equipment / Section
          </label>

          <select
            value={equipmentType}
            onChange={(e) => setEquipmentType(e.target.value)}
            className="w-full rounded-lg border p-3 text-black"
          >
            <option>HVAC</option>
            <option>Plumbing</option>
            <option>Appliances</option>
            <option>Electrical</option>
            <option>General</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">Severity</label>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full rounded-lg border p-3 text-black"
          >
            {SEVERITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">
            Take Photo / Choose From Gallery
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            className="w-full rounded-lg border bg-white p-3 text-black"
          />

          <p className="mt-2 text-xs text-gray-600">
            On iPhone, this should allow Camera, Photo Library, or Browse.
          </p>
        </div>

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Data plate preview"
            className="max-h-96 w-full rounded-lg border object-contain"
          />
        )}

        <button
          onClick={scanDataPlate}
          disabled={loading || !file}
          className="w-full rounded-lg bg-teal-600 py-4 font-bold text-white disabled:opacity-50"
        >
          {loading ? "Scanning..." : "Scan Data Plate"}
        </button>
      </div>

      {result && (
        <div className="mt-6 space-y-4 rounded-xl border border-teal-600 bg-white p-5">
          <h3 className="text-xl font-bold text-teal-700">Scan Result</h3>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full rounded-lg border p-3 text-black"
          >
            {SEVERITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <input
            value={result.title}
            onChange={(e) =>
              setResult({
                ...result,
                title: e.target.value,
              })
            }
            className="w-full rounded-lg border p-3 font-bold text-black"
          />

          <textarea
            value={result.observation}
            onChange={(e) =>
              setResult({
                ...result,
                observation: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Observation"
          />

          <textarea
            value={result.implication}
            onChange={(e) =>
              setResult({
                ...result,
                implication: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Implication"
          />

          <textarea
            value={result.recommendation}
            onChange={(e) =>
              setResult({
                ...result,
                recommendation: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Recommendation"
          />

          <button
            onClick={saveToReport}
            disabled={saving}
            className="w-full rounded-lg bg-teal-600 py-4 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Data Plate to Report"}
          </button>
        </div>
      )}
    </section>
  );
}