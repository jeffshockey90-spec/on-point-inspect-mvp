"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

type Finding = {
  section: string;
  severity: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  image_url?: string;
};

export default function FindingGenerator({ reportId }: { reportId: string }) {
  const router = useRouter();

  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedFinding, setGeneratedFinding] = useState<Finding | null>(null);

  function handleFileChange(selectedFile: File | null) {
    setErrorMessage("");

    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setUploadedImageUrl("");
  }

  async function uploadImage() {
    if (!file) return "";

    const fileExt = file.name.split(".").pop() || "jpg";

    const fileName = `${reportId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

    if (error) {
      throw new Error(`Photo upload failed: ${error.message}`);
    }

    const { data } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function generateFinding() {
    try {
      setLoading(true);
      setErrorMessage("");

      let imageUrl = uploadedImageUrl;

      if (file && !imageUrl) {
        imageUrl = await uploadImage();
        setUploadedImageUrl(imageUrl);
      }

      const finalNote = `
Section selected by inspector: ${section}
Severity level selected by inspector: ${severity}

Inspector note:
${note || "Inspector uploaded a photo and requested an AI-generated finding."}

Photo URL:
${imageUrl || "No photo uploaded."}
`;

      const res = await fetch("/api/ai/finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
          section,
          severity,
          note: finalNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI finding failed.");
      }

      setGeneratedFinding({
        section: data.section || section,
        severity: data.severity || severity,
        title: data.title || "",
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
        image_url: imageUrl,
      });
    } catch (error: any) {
      setErrorMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFinding() {
    if (!generatedFinding) return;

    try {
      setSaving(true);
      setErrorMessage("");

      const { data: savedFinding, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: reportId,
          section: generatedFinding.section,
          severity: generatedFinding.severity,
          title: generatedFinding.title,
          observation: generatedFinding.observation,
          implication: generatedFinding.implication,
          recommendation: generatedFinding.recommendation,
          image_url: generatedFinding.image_url || null,
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (generatedFinding.image_url && savedFinding?.id) {
        await supabase.from("photos").insert({
          inspection_id: reportId,
          finding_id: savedFinding.id,
          url: generatedFinding.image_url,
          image_url: generatedFinding.image_url,
        });
      }

      setGeneratedFinding(null);
      setSection("Exterior");
      setSeverity("Recommended Repair");
      setNote("");
      setFile(null);
      setPreviewUrl("");
      setUploadedImageUrl("");

      router.refresh();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to save finding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-300 bg-gray-50 p-5 text-black">
      <h2 className="mb-4 text-2xl font-bold text-teal-700">
        Add AI Photo Finding
      </h2>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold">Section</label>

          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="w-full rounded-lg border p-3 text-black"
          >
            {SECTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
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
              <option key={item} value={item}>
                {item}
              </option>
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
            capture="environment"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            className="w-full rounded-lg border bg-white p-3 text-black"
          />
        </div>

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Inspection preview"
            className="max-h-96 w-full rounded-lg border object-contain"
          />
        )}

        <div>
          <label className="mb-2 block text-sm font-bold">Inspector Note</label>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Example: Missing GFCI protection at kitchen counter outlet."
            className="min-h-32 w-full rounded-lg border p-3 text-black"
          />
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={generateFinding}
          disabled={loading || (!file && !note.trim())}
          className="w-full touch-manipulation rounded-lg bg-teal-600 py-4 font-bold text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate AI Finding"}
        </button>
      </div>

      {generatedFinding && (
        <div className="mt-6 space-y-4 rounded-xl border border-teal-600 bg-white p-5">
          <h3 className="text-xl font-bold text-teal-700">
            Generated Finding
          </h3>

          <select
            value={generatedFinding.section}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                section: e.target.value,
              })
            }
            className="w-full rounded-lg border p-3 text-black"
          >
            {SECTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={generatedFinding.severity}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                severity: e.target.value,
              })
            }
            className="w-full rounded-lg border p-3 text-black"
          >
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          {generatedFinding.image_url && (
            <img
              src={generatedFinding.image_url}
              alt="Generated finding"
              className="max-h-96 w-full rounded-lg border object-contain"
            />
          )}

          <input
            value={generatedFinding.title}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                title: e.target.value,
              })
            }
            className="w-full rounded-lg border p-3 font-bold text-black"
            placeholder="Title"
          />

          <textarea
            value={generatedFinding.observation}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                observation: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Observation"
          />

          <textarea
            value={generatedFinding.implication}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                implication: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Implication"
          />

          <textarea
            value={generatedFinding.recommendation}
            onChange={(e) =>
              setGeneratedFinding({
                ...generatedFinding,
                recommendation: e.target.value,
              })
            }
            className="min-h-28 w-full rounded-lg border p-3 text-black"
            placeholder="Recommendation"
          />

          <button
            type="button"
            onClick={saveFinding}
            disabled={saving}
            className="w-full touch-manipulation rounded-lg bg-teal-600 py-4 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Finding to Report"}
          </button>
        </div>
      )}
    </section>
  );
}