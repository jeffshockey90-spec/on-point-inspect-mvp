"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import EquipmentCard from "../components/EquipmentCard";

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

export default function EquipmentTestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-6 text-white">
          Loading...
        </main>
      }
    >
      <EquipmentTestContent />
    </Suspense>
  );
}

function EquipmentTestContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id");

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

  async function addToReport() {
    if (!result) return;

    if (!inspectionId) {
      setSaveError(
        "Missing inspection_id. Open this page from an inspection or add ?inspection_id=YOUR_ID to the URL."
      );
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError("");

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
        image_url: "",
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
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <a
            href={inspectionId ? `/reports/${inspectionId}` : "/reports"}
            className="mb-4 inline-block rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            ← Back To Report
          </a>

          <h1 className="text-3xl font-bold">AI Equipment Scanner</h1>

          <p className="mt-2 text-slate-400">
            Upload HVAC, electrical, or plumbing equipment photos.
          </p>

          {!inspectionId && (
            <p className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              Test mode only. To save to a report, this page needs an
              inspection_id in the URL.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <input
            type="file"
            accept="image/*"
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
          <>
            <EquipmentCard equipment={result} />

            <button
              onClick={addToReport}
              disabled={saving}
              className="w-full rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add To Report"}
            </button>

            {saved && (
              <div className="rounded-xl bg-green-500/10 p-3 text-green-300">
                <p>Saved to report.</p>

                {inspectionId && (
                  <a
                    href={`/reports/${inspectionId}`}
                    className="mt-3 inline-block rounded-lg bg-green-500 px-4 py-2 font-bold text-slate-950"
                  >
                    Back To Updated Report
                  </a>
                )}
              </div>
            )}

            {saveError && (
              <p className="rounded-xl bg-red-500/10 p-3 text-red-300">
                {saveError}
              </p>
            )}
          </>
        )}

        {result?.observation && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Suggested Inspection Finding</h2>

            <div className="mt-5 space-y-5">
              <div>
                <h3 className="font-bold text-teal-400">Observation</h3>
                <p className="mt-1 text-slate-200">{result.observation}</p>
              </div>

              <div>
                <h3 className="font-bold text-yellow-400">Implication</h3>
                <p className="mt-1 text-slate-200">{result.implication}</p>
              </div>

              <div>
                <h3 className="font-bold text-red-400">Recommendation</h3>
                <p className="mt-1 text-slate-200">{result.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {result?.error && (
          <pre className="overflow-auto rounded-2xl bg-red-950 p-4 text-sm text-red-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}