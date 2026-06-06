"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import EquipmentCard from "../../components/EquipmentCard";
import { supabase } from "../../lib/supabaseClient";

type EquipmentResult = {
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  estimatedAge?: string | number;
  expectedServiceLife?: string;
  estimatedSEER?: string;
  estimatedAFUE?: string;
  estimatedBTU?: string;
  equipmentCategory?: string;
  maintenanceLevel?: string;
  efficiency?: string;
  capacity?: string;
  fuelType?: string;
  refrigerant?: string;
  condition?: string;
  estimatedLifeRemaining?: string;
  clientSummary?: string;
  section?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
  intelligenceFlags?: {
    category?: string;
    r22Detected?: boolean;
    problemPanelDetected?: boolean;
    problemPanelType?: string | null;
    ageBasedSeverityApplied?: boolean;
  };
  error?: string;
  raw?: string;
};


async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image file."));
    };

    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });
}

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(originalDataUrl);

    const maxDimension = 1800;
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.78);
    });

    if (!blob) return file;

    const originalName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${originalName}-optimized.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function shouldCreateFinding(result: EquipmentResult) {
  const severity = String(result.severity || "").toLowerCase();
  const condition = String(result.condition || "").toLowerCase();

  if (result.intelligenceFlags?.problemPanelDetected) return true;
  if (result.intelligenceFlags?.r22Detected) return true;

  if (
    severity.includes("monitor") ||
    severity.includes("maintenance") ||
    severity.includes("repair") ||
    severity.includes("safety") ||
    severity.includes("major")
  ) {
    return true;
  }

  if (
    condition.includes("near end") ||
    condition.includes("beyond") ||
    condition.includes("end of typical service life")
  ) {
    return true;
  }

  return false;
}

function getBudgetPlanning(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const remaining = String(result.estimatedLifeRemaining || "").toLowerCase();

  if (
    condition.includes("beyond") ||
    remaining.includes("beyond") ||
    remaining.includes("0-")
  ) {
    return "Budget for replacement";
  }

  if (condition.includes("near end")) {
    return "Plan and budget for future replacement";
  }

  return "Routine maintenance recommended";
}

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
  const inspectionId = searchParams.get("inspection_id") || "";

  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<EquipmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function analyzeEquipment() {
    if (!image) return;

    setLoading(true);
    setResult(null);
    setSaveError("");

    try {
      const formData = new FormData();
      formData.append("image", image);

      if (inspectionId) {
        formData.append("inspectionId", inspectionId);
      }

      const res = await fetch("/api/analyze-equipment", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      setResult(data);
    } catch (error: any) {
      setSaveError(error.message || "Failed to analyze equipment.");
    } finally {
      setLoading(false);
    }
  }

  async function addToReport() {
    if (!result) return;

    if (!inspectionId) {
      setSaveError(
        "Missing inspection_id. Open this page from a report using the Equipment Analyzer button."
      );
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      let imageUrl = "";
      let filePath = "";

      if (image) {
        const uploadFile = await compressImageForUpload(image);
        const fileExt = "jpg";

        filePath = `${inspectionId}/equipment-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(filePath, uploadFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: uploadFile.type || "image/jpeg",
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(filePath);

        imageUrl = data.publicUrl;
      }

      const { error: inventoryError } = await supabase
        .from("equipment_inventory")
        .insert({
          inspection_id: Number(inspectionId),
          equipment_type: result.equipmentType || "",
          manufacturer: result.manufacturer || "",
          model: result.model || "",
          serial: result.serial || "",
          manufacture_year: result.manufactureYear
            ? String(result.manufactureYear)
            : "",
          estimated_age: result.estimatedAge ? String(result.estimatedAge) : "",
          expected_service_life: result.expectedServiceLife || "",
          estimated_life_remaining: result.estimatedLifeRemaining || "",
          refrigerant: result.refrigerant || "",
          condition: result.condition || "",
          image_url: imageUrl,
          file_path: filePath,
        });

      if (inventoryError) throw inventoryError;

      const createFinding = shouldCreateFinding(result);

      if (!createFinding) {
        window.location.assign(`/reports/${inspectionId}`);
        return;
      }

      const title = `${result.manufacturer || "Equipment"} ${
        result.equipmentType || "Finding"
      }`.trim();

      const recommendation = [
        result.recommendation || "",
        result.clientSummary ? `\n\nClient Summary: ${result.clientSummary}` : "",
        result.equipmentType
          ? `\n\nEquipment Type: ${result.equipmentType}`
          : "",
        result.manufacturer
          ? `Manufacturer: ${result.manufacturer}`
          : "",
        result.model ? `Model Number: ${result.model}` : "",
        result.serial ? `Serial Number: ${result.serial}` : "",
        result.manufactureYear
          ? `Manufacture Year: ${result.manufactureYear}`
          : "",
        result.estimatedAge
          ? `Estimated Age: ${result.estimatedAge}`
          : "",
        result.expectedServiceLife
          ? `Expected Service Life: ${result.expectedServiceLife}`
          : "",
        result.estimatedLifeRemaining
          ? `Estimated Life Remaining: ${result.estimatedLifeRemaining}`
          : "",
        result.condition ? `Condition: ${result.condition}` : "",
        result.estimatedSEER ? `Estimated SEER/SEER2: ${result.estimatedSEER}` : "",
        result.estimatedAFUE ? `Estimated AFUE: ${result.estimatedAFUE}` : "",
        result.estimatedBTU ? `Estimated Capacity: ${result.estimatedBTU}` : "",
        result.maintenanceLevel ? `Maintenance Level: ${result.maintenanceLevel}` : "",
        `Budget Planning: ${getBudgetPlanning(result)}`,
        result.capacity ? `Capacity: ${result.capacity}` : "",
        result.efficiency
          ? `Efficiency: ${result.efficiency}`
          : "",
        result.fuelType ? `Fuel Type: ${result.fuelType}` : "",
        result.refrigerant
          ? `Refrigerant: ${result.refrigerant}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          section: result.section || "Heating",
          severity: result.severity || "Informational",
          title,
          observation: result.observation || "",
          implication: result.implication || "",
          recommendation,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      if (image && findingData) {
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
      setSaveError(error.message || "Failed to save finding.");
      setSaving(false);
    }
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

          <h1 className="text-3xl font-bold">
            AI Equipment Scanner
          </h1>

          <p className="mt-2 text-slate-400">
            Upload HVAC, electrical, plumbing, water heater, or appliance equipment photos.
          </p>

          {!inspectionId && (
            <p className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              Test mode only. To save to a report, open this page
              from a report.
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
              setSaveError("");
              setPreview(
                file ? URL.createObjectURL(file) : ""
              );
            }}
          />

          {preview && (
            <img
                src={preview}
                loading="lazy"
                decoding="async"
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

            <EnhancedEquipmentIntelligence result={result} />

            <button
              onClick={addToReport}
              disabled={saving}
              className="w-full rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : shouldCreateFinding(result)
                  ? "Add To Report"
                  : "Save To Equipment Inventory"}
            </button>

            {!shouldCreateFinding(result) && (
              <p className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-200">
                This appears to be informational equipment data only. It will be saved to Equipment Inventory and will not count as a defect.
              </p>
            )}

            {saveError && (
              <p className="rounded-xl bg-red-500/10 p-3 text-red-300">
                {saveError}
              </p>
            )}
          </>
        )}

        {result?.observation && shouldCreateFinding(result) && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">
              Suggested Inspection Finding
            </h2>

            <div className="mt-5 space-y-5">
              <div>
                <h3 className="font-bold text-teal-400">
                  Observation
                </h3>

                <p className="mt-1 text-slate-200">
                  {result.observation}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-yellow-400">
                  Implication
                </h3>

                <p className="mt-1 text-slate-200">
                  {result.implication}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-red-400">
                  Recommendation
                </h3>

                <p className="mt-1 text-slate-200">
                  {result.recommendation}
                </p>
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

function EnhancedEquipmentIntelligence({ result }: { result: EquipmentResult }) {
  return (
    <section className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-5 shadow-xl">
      <h2 className="text-xl font-bold text-teal-300">
        Enhanced Equipment Intelligence
      </h2>

      {result.clientSummary && (
        <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-200">
          {result.clientSummary}
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <IntelligenceItem
          label="Expected Service Life"
          value={result.expectedServiceLife || "Unknown"}
        />
        <IntelligenceItem
          label="Estimated Life Remaining"
          value={result.estimatedLifeRemaining || "Unknown"}
        />
        <IntelligenceItem
          label="Condition"
          value={result.condition || "Unknown"}
        />
        <IntelligenceItem
          label="Estimated Efficiency"
          value={result.estimatedSEER || result.estimatedAFUE || result.efficiency || "Unknown"}
        />
        <IntelligenceItem
          label="Estimated Capacity"
          value={result.estimatedBTU || result.capacity || "Unknown"}
        />
        <IntelligenceItem
          label="Budget Planning"
          value={getBudgetPlanning(result)}
        />
        <IntelligenceItem
          label="Maintenance Level"
          value={result.maintenanceLevel || "Unknown"}
        />
        <IntelligenceItem
          label="Refrigerant"
          value={result.refrigerant || "Unknown"}
        />
        <IntelligenceItem
          label="Fuel Type"
          value={result.fuelType || "Unknown"}
        />
      </div>

      {result.intelligenceFlags?.r22Detected && (
        <p className="mt-4 rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-sm font-semibold text-orange-200">
          R-22 refrigerant detected. This refrigerant is obsolete and can be expensive to service.
        </p>
      )}

      {result.intelligenceFlags?.problemPanelDetected && (
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
          Potential problem electrical panel detected: {result.intelligenceFlags.problemPanelType}. Electrical contractor evaluation is recommended.
        </p>
      )}
    </section>
  );
}

function IntelligenceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white">
        {value || "Unknown"}
      </p>
    </div>
  );
}
