"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

const MAX_PHOTOS = 25;

const DEFAULT_BULK_AI_GUIDANCE =
  "Identify the main inspection defect in each photo. Do not create findings for background items. Keep each photo to one finding only. Use the inspector note as the primary issue when provided. If plumbing is the main concern, route to Plumbing. If electrical is the main concern, route to Electrical. If roof covering, shingles, flashing, or roof penetration is the main concern, route to Roof. If siding, trim, grading, decks, porches, exterior doors, or exterior penetrations are the main concern, route to Exterior. Be conservative, realtor-friendly, and do not exaggerate.";


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

type BulkItem = {
  id: string;
  file: File;
  previewUrl: string;
  note: string;
  status: "ready" | "analyzing" | "review" | "saving" | "saved" | "error";
  error: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  equipmentType: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  estimatedAge: string;
  notes: string;
  savedFindingId: string;
  savedImageUrl: string;
  savedFilePath: string;
};

function makeItem(file: File): BulkItem {
  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    note: "",
    status: "ready",
    error: "",
    title: "",
    section: "Exterior",
    severity: "Recommended Repair",
    observation: "",
    implication: "",
    recommendation: "",
    equipmentType: "",
    manufacturer: "",
    modelNumber: "",
    serialNumber: "",
    estimatedAge: "",
    notes: "",
    savedFindingId: "",
    savedImageUrl: "",
    savedFilePath: "",
  };
}

export default function BulkAICapturePage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = String(params?.id || "");

  const [items, setItems] = useState<BulkItem[]>([]);
  const [globalNote, setGlobalNote] = useState(DEFAULT_BULK_AI_GUIDANCE);
  const [aiMemory, setAiMemory] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const savedMemory = window.localStorage.getItem("onpoint_bulk_ai_memory") || "";
      if (savedMemory) setAiMemory(savedMemory);
    } catch {}
  }, []);

  function saveAIMemory() {
    try {
      window.localStorage.setItem("onpoint_bulk_ai_memory", aiMemory);
      alert("Bulk AI guidance memory saved on this device.");
    } catch {
      alert("Could not save AI guidance memory on this device.");
    }
  }

  const savedCount = useMemo(
    () => items.filter((item) => item.status === "saved").length,
    [items]
  );

  const reviewCount = useMemo(
    () => items.filter((item) => item.status === "review").length,
    [items]
  );

  function updateItem(id: string, patch: Partial<BulkItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (selected.length === 0) return;

    const limited = selected.slice(0, MAX_PHOTOS);
    setItems(limited.map(makeItem));
  }

  async function analyzeOne(item: BulkItem) {
    updateItem(item.id, { status: "analyzing", error: "" });

    try {
      const base64 = await fileToBase64(item.file);
      const combinedNote = [
        DEFAULT_BULK_AI_GUIDANCE,
        aiMemory.trim(),
        globalNote.trim(),
        item.note.trim(),
      ]
        .filter(Boolean)
        .join("\n\n");

      const res = await fetch("/api/ai-photo-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mode: "inspection",
          inspectorNote: combinedNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI analysis failed.");
      }

      updateItem(item.id, {
        status: "review",
        title: data.title || "Inspection Finding",
        section: SECTIONS.includes(data.section) ? data.section : "Exterior",
        severity: SEVERITIES.includes(data.severity)
          ? data.severity
          : "Recommended Repair",
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
        equipmentType: data.equipment_type || "",
        manufacturer: data.manufacturer || "",
        modelNumber: data.model_number || "",
        serialNumber: data.serial_number || "",
        estimatedAge: data.estimated_age || "",
        notes: data.notes || "",
      });
    } catch (error: any) {
      updateItem(item.id, {
        status: "error",
        error: error?.message || "Failed to analyze photo.",
      });
    }
  }

  async function analyzeAll() {
    if (items.length === 0 || busy) return;

    setBusy(true);

    const snapshot = [...items];

    for (const item of snapshot) {
      if (item.status === "saved") continue;
      await analyzeOne(item);
    }

    setBusy(false);
  }

  async function saveOne(item: BulkItem) {
    if (!inspectionId) {
      updateItem(item.id, {
        status: "error",
        error: "Missing inspection ID. Open Bulk AI Capture from inside a report.",
      });
      return;
    }

    if (!item.title.trim()) {
      updateItem(item.id, {
        status: "error",
        error: "Finding title is required before saving.",
      });
      return;
    }

    if (item.savedFindingId) {
      updateItem(item.id, { status: "saving", error: "" });

      try {
        const fullRecommendation = buildFullRecommendation(item);

        const { error } = await supabase
          .from("findings")
          .update({
            title: item.title,
            section: item.section,
            severity: item.severity,
            observation: item.observation,
            implication: item.implication,
            recommendation: fullRecommendation,
            image_url: item.savedImageUrl,
          })
          .eq("id", item.savedFindingId)
          .eq("inspection_id", inspectionId);

        if (error) throw error;

        updateItem(item.id, { status: "saved", error: "" });
      } catch (error: any) {
        updateItem(item.id, {
          status: "error",
          error: error?.message || "Failed to update saved finding.",
        });
      }

      return;
    }

    updateItem(item.id, { status: "saving", error: "" });

    try {
      let imageUrl = "";
      let filePath = "";

      const fileExt = item.file.name.split(".").pop() || "jpg";
      filePath = `${inspectionId}/${Date.now()}-${safeFileName(item.file.name)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(filePath, item.file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      imageUrl = data.publicUrl;

      const fullRecommendation = buildFullRecommendation(item);

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title: item.title,
          section: item.section,
          severity: item.severity,
          observation: item.observation,
          implication: item.implication,
          recommendation: fullRecommendation,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      if (findingData) {
        const { error: photoError } = await supabase.from("photos").insert({
          inspection_id: inspectionId,
          finding_id: findingData.id,
          public_url: imageUrl,
          file_path: filePath,
        });

        if (photoError) throw photoError;
      }

      updateItem(item.id, { status: "saved", error: "", savedFindingId: findingData?.id || "", savedImageUrl: imageUrl, savedFilePath: filePath });
    } catch (error: any) {
      updateItem(item.id, {
        status: "error",
        error: error?.message || "Failed to save finding.",
      });
    }
  }

  async function saveAllReviewed() {
    if (busy) return;

    setBusy(true);

    const snapshot = items.filter((item) => item.status === "review");

    for (const item of snapshot) {
      await saveOne(item);
    }

    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-teal-400">
              On Point AI
            </p>
            <h1 className="mt-2 text-4xl font-extrabold">Bulk AI Capture</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Upload multiple inspection photos. The app will analyze each photo
              one at a time, auto-select the report section, and let you review
              before saving findings to the report.
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
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Upload Photos
          </h2>

          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleFileChange}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"
          />

          <textarea
            value={globalNote}
            onChange={(e) => setGlobalNote(e.target.value)}
            rows={4}
            placeholder="Optional note for all photos... Example: write concise realtor-friendly findings and route defects to the best section."
            className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
          />

          <div className="mt-5 rounded-2xl border border-purple-800 bg-purple-950/20 p-4">
            <h3 className="text-lg font-extrabold text-purple-300">
              AI Guidance Memory
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Optional saved guidance for how you want Bulk AI Capture to write and route findings on this device.
            </p>

            <textarea
              value={aiMemory}
              onChange={(e) => setAiMemory(e.target.value)}
              rows={4}
              placeholder="Example: Always keep findings concise. Route sink, drain, supply, toilet, tub, shower, water heater, and visible leaks to Plumbing. Do not create findings for background items."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-purple-400"
            />

            <button
              type="button"
              onClick={saveAIMemory}
              className="mt-3 rounded-xl border border-purple-500 px-5 py-2 font-bold text-purple-200 hover:bg-purple-500/10"
            >
              Save AI Guidance Memory
            </button>
          </div>

          <p className="mt-4 rounded-xl border border-teal-800 bg-teal-950/20 p-3 text-sm text-teal-100">
            Tip: For best accuracy, add a quick 2–5 word note on confusing photos, such as “leak under sink,” “missing GFCI,” “damaged shingles,” or “loose toilet.”
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={analyzeAll}
              disabled={items.length === 0 || busy}
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
            >
              {busy ? "Working..." : "Analyze All Photos"}
            </button>

            <button
              onClick={saveAllReviewed}
              disabled={reviewCount === 0 || busy}
              className="rounded-xl bg-purple-600 px-6 py-3 font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              Save All Reviewed Findings
            </button>

            <button
              onClick={() => router.push(`/reports/${inspectionId}`)}
              disabled={!inspectionId || busy}
              className="rounded-xl border border-slate-700 px-6 py-3 font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Return to Report
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Selected: {items.length} / {MAX_PHOTOS} · Ready to save: {reviewCount} · Saved: {savedCount}
          </p>
        </section>

        {items.length > 0 && (
          <section className="space-y-5">
            {items.map((item, index) => (
              <PhotoReviewCard
                key={item.id}
                index={index}
                item={item}
                updateItem={updateItem}
                analyzeOne={analyzeOne}
                saveOne={saveOne}
                busy={busy}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function PhotoReviewCard({
  index,
  item,
  updateItem,
  analyzeOne,
  saveOne,
  busy,
}: {
  index: number;
  item: BulkItem;
  updateItem: (id: string, patch: Partial<BulkItem>) => void;
  analyzeOne: (item: BulkItem) => Promise<void>;
  saveOne: (item: BulkItem) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-teal-300">
            Photo {index + 1}
          </h3>
          <p className="text-sm text-slate-400">{item.file.name}</p>
        </div>

        <StatusBadge status={item.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div>
          <img
            src={item.previewUrl}
            alt={`Preview ${index + 1}`}
            className="max-h-[320px] w-full rounded-xl border border-slate-700 object-contain"
          />

          <textarea
            value={item.note}
            onChange={(e) => updateItem(item.id, { note: e.target.value })}
            rows={4}
            placeholder="Optional note for this photo..."
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => analyzeOne(item)}
              disabled={busy || item.status === "analyzing" || item.status === "saving"}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              Re-Analyze
            </button>

            <button
              onClick={() => saveOne(item)}
              disabled={busy || item.status !== "review"}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              Save Finding
            </button>
          </div>

          {item.error && (
            <p className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
              {item.error}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <input
            value={item.title}
            onChange={(e) => updateItem(item.id, { title: e.target.value })}
            placeholder="Finding title"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={item.section}
              onChange={(e) => updateItem(item.id, { section: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
            >
              {SECTIONS.map((section) => (
                <option key={section}>{section}</option>
              ))}
            </select>

            <select
              value={item.severity}
              onChange={(e) => updateItem(item.id, { severity: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
            >
              {SEVERITIES.map((severity) => (
                <option key={severity}>{severity}</option>
              ))}
            </select>
          </div>

          <MiniTextArea
            label="Observation"
            value={item.observation}
            onChange={(value) => updateItem(item.id, { observation: value })}
          />
          <MiniTextArea
            label="Implication"
            value={item.implication}
            onChange={(value) => updateItem(item.id, { implication: value })}
          />
          <MiniTextArea
            label="Recommendation"
            value={item.recommendation}
            onChange={(value) => updateItem(item.id, { recommendation: value })}
          />

          {(item.equipmentType ||
            item.manufacturer ||
            item.modelNumber ||
            item.serialNumber ||
            item.estimatedAge ||
            item.notes) && (
            <div className="rounded-xl border border-blue-800 bg-blue-950/20 p-4">
              <h4 className="mb-3 font-bold text-blue-300">Equipment Data</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <SmallInput
                  label="Equipment Type"
                  value={item.equipmentType}
                  onChange={(value) => updateItem(item.id, { equipmentType: value })}
                />
                <SmallInput
                  label="Manufacturer"
                  value={item.manufacturer}
                  onChange={(value) => updateItem(item.id, { manufacturer: value })}
                />
                <SmallInput
                  label="Model Number"
                  value={item.modelNumber}
                  onChange={(value) => updateItem(item.id, { modelNumber: value })}
                />
                <SmallInput
                  label="Serial Number"
                  value={item.serialNumber}
                  onChange={(value) => updateItem(item.id, { serialNumber: value })}
                />
                <SmallInput
                  label="Estimated Age"
                  value={item.estimatedAge}
                  onChange={(value) => updateItem(item.id, { estimatedAge: value })}
                />
              </div>
              <MiniTextArea
                label="Equipment Notes"
                value={item.notes}
                onChange={(value) => updateItem(item.id, { notes: value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BulkItem["status"] }) {
  const labelMap: Record<BulkItem["status"], string> = {
    ready: "Ready",
    analyzing: "Analyzing",
    review: "Ready To Review",
    saving: "Saving",
    saved: "Saved",
    error: "Needs Attention",
  };

  return (
    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-sm font-bold text-slate-200">
      {labelMap[status]}
    </span>
  );
}

function MiniTextArea({
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
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

function SmallInput({
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
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

function buildFullRecommendation(item: BulkItem) {
  return [
    item.recommendation,
    item.equipmentType ? `\n\nEquipment Type: ${item.equipmentType}` : "",
    item.manufacturer ? `Manufacturer: ${item.manufacturer}` : "",
    item.modelNumber ? `Model Number: ${item.modelNumber}` : "",
    item.serialNumber ? `Serial Number: ${item.serialNumber}` : "",
    item.estimatedAge ? `Estimated Age: ${item.estimatedAge}` : "",
    item.notes ? `Additional Notes: ${item.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function safeFileName(name: string) {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);
}
