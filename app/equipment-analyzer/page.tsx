"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import EquipmentCard from "../../components/EquipmentCard";
import FastLinkButton from "../../components/FastLinkButton";
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
  equipmentStatus?: string;
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
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("beyond") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
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
    return "Monitor and budget for eventual replacement";
  }

  if (condition.includes("near end")) {
    return "Plan for future replacement as the equipment ages";
  }

  return "Routine maintenance recommended";
}

function cleanServiceLifeCondition(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return "No specific deficiency noted";

  if (
    lower.includes("typical service life remaining") ||
    lower.includes("service life remaining") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  if (
    lower.includes("near end") ||
    lower.includes("end of typical service life") ||
    lower.includes("beyond")
  ) {
    return "Older equipment. Monitor and budget for replacement as needed.";
  }

  return clean;
}

function isMeaningfulEquipmentValue(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return false;

  const lower = clean.toLowerCase();

  if (
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "not visible" ||
    lower === "not shown" ||
    lower === "not readable" ||
    lower === "unreadable" ||
    lower === "unable to determine" ||
    lower === "cannot determine"
  ) {
    return false;
  }

  return true;
}

function meaningfulEquipmentValue(value: any) {
  return isMeaningfulEquipmentValue(value) ? String(value).trim() : "";
}

function getEquipmentTypeText(result: EquipmentResult) {
  return String(result.equipmentType || result.equipmentCategory || "").toLowerCase();
}

function isWaterHeaterEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.manufacturer,
    result.model,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("water heater") ||
    text.includes("storage tank water heater") ||
    text.includes("tankless") ||
    text.includes("hot water")
  );
}

function isHvacEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("air handler") ||
    text.includes("furnace") ||
    text.includes("heat pump") ||
    text.includes("condenser") ||
    text.includes("air conditioner") ||
    text.includes("cooling") ||
    text.includes("heating")
  );
}

function isElectricalPanelEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("electrical panel") ||
    text.includes("breaker panel") ||
    text.includes("panelboard") ||
    text.includes("service panel")
  );
}



function stripMaintenanceLanguageFromInspectorNote(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  return clean
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return !(
        lower.includes("routine maintenance") ||
        lower.includes("regular maintenance") ||
        lower.includes("maintenance is recommended") ||
        lower.includes("recommend maintenance") ||
        lower.includes("servicing is recommended") ||
        lower.includes("service is recommended")
      );
    })
    .join(" ")
    .trim();
}

function getEquipmentStatusLabel(result: EquipmentResult) {
  const explicit = meaningfulEquipmentValue(result.equipmentStatus);
  if (explicit) return explicit;

  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();
  const maintenance = String(result.maintenanceLevel || "").toLowerCase();

  if (result.intelligenceFlags?.problemPanelDetected) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (result.intelligenceFlags?.r22Detected) {
    return "⚠ Service / Replacement Planning Recommended";
  }

  if (
    condition.includes("failed") ||
    condition.includes("not operating")
  ) {
    return "⚠ Service Recommended";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "⚠ Monitor";
  }

  if (
    severity.includes("major") ||
    severity.includes("safety")
  ) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (
    condition.includes("service") ||
    condition.includes("repair") ||
    severity.includes("maintenance")
  ) {
    return "⚠ Service Recommended";
  }

  if (maintenance.includes("elevated")) {
    return "⚠ Monitor";
  }

  return "✓ No Specific Deficiency Noted";
}

function getAiInspectorNote(result: EquipmentResult, optionalAiNote = "") {
  const cleanOptionalAiNote = String(optionalAiNote || "").trim();

  const equipmentType = meaningfulEquipmentValue(result.equipmentType);
  const manufacturer = meaningfulEquipmentValue(result.manufacturer);
  const model = meaningfulEquipmentValue(result.model);
  const manufactureYear = meaningfulEquipmentValue(result.manufactureYear);
  const refrigerant = meaningfulEquipmentValue(result.refrigerant);
  const capacity = meaningfulEquipmentValue(result.capacity || result.estimatedBTU);
  const fuelType = meaningfulEquipmentValue(result.fuelType);
  const condition = meaningfulEquipmentValue(cleanServiceLifeCondition(result.condition));

  const sentences: string[] = [];

  if (cleanOptionalAiNote) {
    sentences.push(`Inspector note: ${cleanOptionalAiNote}.`);
  }

  const equipmentName = [manufacturer, equipmentType]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (equipmentName) {
    sentences.push(`${equipmentName}.`);
  } else {
    sentences.push("Equipment data plate was documented.");
  }

  if (model && manufactureYear) {
    sentences.push(`Model ${model} manufactured in ${manufactureYear}.`);
  } else if (model) {
    sentences.push(`Model ${model}.`);
  } else if (manufactureYear) {
    sentences.push(`Manufactured in ${manufactureYear}.`);
  }

  const detailParts: string[] = [];

  if (capacity) {
    detailParts.push(`${capacity} capacity`);
  }

  if (fuelType) {
    detailParts.push(`${fuelType} fuel type`);
  }

  if (refrigerant && isHvacEquipment(result)) {
    detailParts.push(`${refrigerant} refrigerant`);
  }

  if (detailParts.length > 0) {
    sentences.push(`The unit has ${detailParts.join(" and ")}.`);
  }

  if (
    condition &&
    condition.toLowerCase() !== "no specific deficiency noted" &&
    !condition.toLowerCase().includes("industry estimate")
  ) {
    sentences.push(condition.endsWith(".") ? condition : `${condition}.`);
  } else {
    sentences.push("No significant deficiencies were observed at the time of inspection.");
  }

  return sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function getAiMaintenanceNote(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const remaining = String(result.estimatedLifeRemaining || "").toLowerCase();

  if (isWaterHeaterEquipment(result)) {
    return "Recommend routine water heater maintenance in accordance with manufacturer recommendations.";
  }

  if (isElectricalPanelEquipment(result)) {
    return "Recommend periodic evaluation and maintenance by a qualified electrical contractor as needed.";
  }

  if (isHvacEquipment(result)) {
    if (
      condition.includes("near end") ||
      condition.includes("beyond") ||
      condition.includes("end of typical") ||
      remaining.includes("beyond") ||
      remaining.includes("0-")
    ) {
      return "Recommend routine service by a qualified HVAC contractor and budgeting for future replacement due to age and typical service-life considerations.";
    }

    return "Recommend regular HVAC servicing and filter maintenance in accordance with manufacturer recommendations.";
  }

  return "Recommend routine maintenance in accordance with manufacturer recommendations.";
}



function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

function cleanEquipmentValue(value: any) {
  return isKnownEquipmentValue(value) ? String(value).trim() : "";
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


function getFindingTitlePrefix(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();

  if (
    condition.includes("unsafe") ||
    severity.includes("safety")
  ) {
    return "Safety Concern";
  }

  if (
    condition.includes("failed") ||
    condition.includes("not operating")
  ) {
    return "Defective";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "Older Equipment";
  }

  return "";
}

function getCalmFindingObservation(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const observation = String(result.observation || "").trim();

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    if (
      !observation ||
      observation.toLowerCase().includes("no visible leaks") ||
      observation.toLowerCase().includes("no visible damage") ||
      observation.toLowerCase().includes("no specific")
    ) {
      return "The equipment was operating at the time of inspection, and no active leakage or immediate visible deficiency was observed.";
    }
  }

  return observation || "Equipment condition was documented during the inspection.";
}

function getCalmFindingImplication(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const implication = String(result.implication || "").trim();

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "The equipment is older and may require increased maintenance over time. This does not mean failure is imminent, but budgeting for eventual replacement is prudent.";
  }

  return implication || "Deferred maintenance or component wear may affect reliable operation over time.";
}

function getCalmFindingRecommendation(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();
  const recommendation = String(result.recommendation || "").trim();

  if (
    condition.includes("failed") ||
    condition.includes("not operating") ||
    condition.includes("unsafe") ||
    severity.includes("safety") ||
    severity.includes("major")
  ) {
    return recommendation || "Further evaluation, repair, or replacement is recommended by a qualified contractor.";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "Continue routine maintenance and monitor performance. Budget for eventual replacement as the equipment continues to age.";
  }

  return recommendation || "Routine maintenance is recommended in accordance with manufacturer guidelines.";
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
  const [analyzeLabel, setAnalyzeLabel] = useState("Analyze Equipment");
  const [saveLabel, setSaveLabel] = useState("Add To Report");
  const [optionalAiNote, setOptionalAiNote] = useState("");

  async function analyzeEquipment() {
    if (!image || loading || saving) return;

    setLoading(true);
    setAnalyzeLabel("Preparing Image...");
    setResult(null);
    setSaveError("");

    try {
      const formData = new FormData();
      formData.append("image", image);

      if (optionalAiNote.trim()) {
        formData.append("note", optionalAiNote.trim());
        formData.append("inspectorNote", optionalAiNote.trim());
      }

      if (inspectionId) {
        formData.append("inspectionId", inspectionId);
      }

      setAnalyzeLabel("Analyzing Equipment...");

      const res = await fetch("/api/analyze-equipment", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      setResult(data);
      setAnalyzeLabel("Analysis Complete");
    } catch (error: any) {
      setAnalyzeLabel("Failed");
      setSaveError(error.message || "Failed to analyze equipment.");
    } finally {
      setLoading(false);

      window.setTimeout(() => {
        setAnalyzeLabel("Analyze Equipment");
      }, 900);
    }
  }

  async function addToReport() {
    if (!result || saving || loading) return;

    if (!inspectionId) {
      setSaveError(
        "Missing inspection_id. Open this page from a report using the Equipment Analyzer button."
      );
      return;
    }

    setSaving(true);
    setSaveLabel(shouldCreateFinding(result) ? "Preparing Report Save..." : "Preparing Inventory Save...");
    setSaveError("");

    try {
      let imageUrl = "";
      let filePath = "";

      if (image) {
        setSaveLabel("Optimizing Image...");
        const uploadFile = await compressImageForUpload(image);
        const fileExt = "jpg";

        filePath = `${inspectionId}/equipment-${Date.now()}.${fileExt}`;

        setSaveLabel("Uploading Image...");

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

      setSaveLabel("Saving Equipment Inventory...");

      const { error: inventoryError } = await supabase
        .from("equipment_inventory")
        .insert({
          inspection_id: Number(inspectionId),
          equipment_type: cleanEquipmentValue(result.equipmentType),
          manufacturer: cleanEquipmentValue(result.manufacturer),
          model: cleanEquipmentValue(result.model),
          serial: cleanEquipmentValue(result.serial),
          manufacture_year: cleanEquipmentValue(result.manufactureYear),
          estimated_age: cleanEquipmentValue(result.estimatedAge),
          expected_service_life: cleanEquipmentValue(result.expectedServiceLife),
          estimated_life_remaining: "",
          refrigerant: cleanEquipmentValue(result.refrigerant),
          condition: cleanServiceLifeCondition(result.condition),
          inspector_note: getAiInspectorNote(result, optionalAiNote),
          maintenance_note: getAiMaintenanceNote(result),
          equipment_status: getEquipmentStatusLabel(result),
          image_url: imageUrl,
          file_path: filePath,
        });

      if (inventoryError) throw inventoryError;

      const createFinding = shouldCreateFinding(result);

      if (!createFinding) {
        setSaveLabel("Opening Report...");
        window.location.assign(`/reports/${inspectionId}`);
        return;
      }

      let title = `${cleanEquipmentValue(result.manufacturer) || "Equipment"} ${
        cleanEquipmentValue(result.equipmentType) || "Finding"
      }`.trim();

      const titlePrefix = getFindingTitlePrefix(result);

      if (titlePrefix && !title.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
        title = `${titlePrefix} – ${title}`;
      }

      const observation = getCalmFindingObservation(result);
      const implication = getCalmFindingImplication(result);
      const recommendation = getCalmFindingRecommendation(result);

      setSaveLabel("Creating Finding...");

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          section: result.section || "Heating",
          severity: result.severity || "Informational",
          title,
          observation,
          implication,
          recommendation,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      if (image && findingData) {
        setSaveLabel("Attaching Photo...");

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

      setSaveLabel("Opening Report...");
      window.location.assign(`/reports/${inspectionId}`);
    } catch (error: any) {
      setSaveLabel("Failed");
      setSaveError(error.message || "Failed to save finding.");

      window.setTimeout(() => {
        setSaving(false);
        setSaveLabel(result && shouldCreateFinding(result) ? "Add To Report" : "Save To Equipment Inventory");
      }, 700);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <FastLinkButton
            href={inspectionId ? `/reports/${inspectionId}` : "/reports"}
            loadingText="Opening Report..."
            className="mb-4 rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            ← Back To Report
          </FastLinkButton>

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
            disabled={loading || saving}
            className="block w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-500 file:px-4 file:py-2 file:font-bold file:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
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

          <div className="mt-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Optional note for AI
            </label>
            <textarea
              value={optionalAiNote}
              onChange={(event) => setOptionalAiNote(event.target.value)}
              disabled={loading || saving}
              rows={4}
              placeholder="Optional note for AI... Example: older unit, noisy operation, rust, water stains, client reported issue, damaged cabinet, etc."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-slate-500">
              This note is sent with the scan and saved into the AI Inspector Note so you can edit it later on the report.
            </p>
          </div>

          <button
            type="button"
            onClick={analyzeEquipment}
            disabled={!image || loading || saving}
            aria-busy={loading}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {analyzeLabel}
          </button>
        </div>

        {result && !result.error && (
          <>
            <EquipmentCard equipment={result} />

            <EnhancedEquipmentIntelligence result={result} />

            <button
              type="button"
              onClick={addToReport}
              disabled={saving || loading}
              aria-busy={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 transition active:scale-[0.98] hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
            >
              {saving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {saving
                ? saveLabel
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
                  {getCalmFindingObservation(result)}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-yellow-400">
                  Implication
                </h3>

                <p className="mt-1 text-slate-200">
                  {getCalmFindingImplication(result)}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-red-400">
                  Recommendation
                </h3>

                <p className="mt-1 text-slate-200">
                  {getCalmFindingRecommendation(result)}
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
        <IntelligenceItem label="Equipment Status" value={getEquipmentStatusLabel(result)} />
        {shouldShowIntelligenceValue(result.expectedServiceLife) && (
          <IntelligenceItem
            label="Typical Industry Range"
            value={result.expectedServiceLife || ""}
          />
        )}
        {shouldShowIntelligenceValue(result.expectedServiceLife) && (
          <IntelligenceItem
            label="Service Life"
            value="Industry estimate only"
          />
        )}
        {shouldShowIntelligenceValue(cleanServiceLifeCondition(result.condition)) && (
          <IntelligenceItem
            label="Condition"
            value={cleanServiceLifeCondition(result.condition)}
          />
        )}
        {shouldShowIntelligenceValue(result.estimatedSEER || result.estimatedAFUE || result.efficiency) && (
          <IntelligenceItem
            label="Estimated Efficiency"
            value={result.estimatedSEER || result.estimatedAFUE || result.efficiency || ""}
          />
        )}
        {shouldShowIntelligenceValue(result.estimatedBTU || result.capacity) && (
          <IntelligenceItem
            label="Estimated Capacity"
            value={result.estimatedBTU || result.capacity || ""}
          />
        )}
        <IntelligenceItem
          label="Budget Planning"
          value={getBudgetPlanning(result)}
        />
        {shouldShowIntelligenceValue(result.maintenanceLevel) && (
          <IntelligenceItem
            label="Maintenance Level"
            value={result.maintenanceLevel || ""}
          />
        )}
        {shouldShowIntelligenceValue(result.refrigerant) && (
          <IntelligenceItem
            label="Refrigerant"
            value={result.refrigerant || ""}
          />
        )}
        {shouldShowIntelligenceValue(result.fuelType) && (
          <IntelligenceItem
            label="Fuel Type"
            value={result.fuelType || ""}
          />
        )}
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


function shouldShowIntelligenceValue(value: any) {
  return isMeaningfulEquipmentValue(value);
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
