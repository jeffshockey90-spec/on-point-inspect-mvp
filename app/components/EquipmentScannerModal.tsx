"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import EquipmentCard from "./EquipmentCard";

type EquipmentResult = {
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  estimatedAge?: string | number;
  efficiency?: string;
  capacity?: string;
  fuelType?: string;
  refrigerant?: string;
  condition?: string;
  estimatedLifeRemaining?: string;
  section?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
  error?: string;
  raw?: string;
};

export default function EquipmentScannerModal({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<EquipmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function analyzeEquipment() {
    if (!image) return;

    setLoading(true);
    setResult(null);
    setSaved(false);
    setSaveError("");

    const formData = new FormData();
    formData.append("image", image);

    const res = await fetch("/api/analyze-equipment", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    setResult(data);
    setLoading(false);
  }

  async function uploadEquipmentPhoto() {
    if (!image) return "";

    const fileExt = image.name.split(".").pop() || "jpg";
    const fileName = `${inspectionId}/equipment-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, image, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function addToReport() {
    if (!result) return;

    setSaving(true);
    setSaved(false);
    setSaveError("");

    try {
      const uploadedImageUrl = await uploadEquipmentPhoto();

      const title = `${result.manufacturer || "Equipment"} ${
        result.equipmentType || "Finding"
      }`;

      const res = await fetch("/api/save-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspection_id: inspectionId,
          section: result.section || "General",
          title,
          observation: result.observation || "",
          implication: result.implication || "",
          recommendation: result.recommendation || "",
          image_url: uploadedImageUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || "Failed to save finding");
        setSaving(false);
        return;
      }

      setSaved(true);
      setSaving(false);

      setTimeout(() => {
        window.location.href = `/reports/${inspectionId}`;
      }, 700);
    } catch (error: any) {
      setSaveError(error.message || "Failed to upload photo");
      setSaving(false);
    }
  }

  function resetModal() {
    setImage(null);
    setPreview("");
    setResult(null);
    setLoading(false);
    setSaving(false);
    setSaved(false);
    setSaveError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-black transition hover:bg-cyan-400"
      >
        AI Equipment Scanner
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto max-w-4xl rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-teal-400">
                  AI Equipment Scanner
                </h2>
                <p className="text-sm text-slate-400">
                  Upload HVAC, electrical, or plumbing equipment photos.
                </p>
              </div>

              <button
                onClick={() => {
                  resetModal();
                  setOpen(false);
                }}
                className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;

                  setImage(file);
                  setResult(null);
                  setSaved(false);
                  setSaveError("");

                  if (file) {
                    setPreview(URL.createObjectURL(file));
                  } else {
                    setPreview("");
                  }
                }}
              />

              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="mt-4 max-h-96 w-full rounded-xl object-contain"
                />
              )}

              <button
                onClick={analyzeEquipment}
                disabled={!image || loading}
                className="mt-4 rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
              >
                {loading ? "Analyzing..." : "Analyze Equipment"}
              </button>
            </div>

            {result && !result.error && (
              <div className="mt-5 space-y-5">
                <EquipmentCard equipment={result} />

                <button
                  onClick={addToReport}
                  disabled={saving}
                  className="w-full rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
                >
                  {saving ? "Saving Photo & Finding..." : "Add To Report"}
                </button>

                {saved && (
                  <p className="rounded-xl bg-green-500/10 p-3 text-green-300">
                    Saved. Returning to updated report...
                  </p>
                )}

                {saveError && (
                  <p className="rounded-xl bg-red-500/10 p-3 text-red-300">
                    {saveError}
                  </p>
                )}
              </div>
            )}

            {result?.observation && (
              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <h3 className="text-xl font-bold">
                  Suggested Inspection Finding
                </h3>

                <div className="mt-5 space-y-5">
                  <div>
                    <h4 className="font-bold text-teal-400">Observation</h4>
                    <p className="mt-1 text-slate-200">
                      {result.observation}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-yellow-400">Implication</h4>
                    <p className="mt-1 text-slate-200">
                      {result.implication}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-red-400">Recommendation</h4>
                    <p className="mt-1 text-slate-200">
                      {result.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {result?.error && (
              <pre className="mt-5 overflow-auto rounded-2xl bg-red-950 p-4 text-sm text-red-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}