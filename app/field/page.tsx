"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { supabase } from "../../lib/supabaseClient";
import { isLikelyNetworkError } from "../../lib/networkError";
import {
  createFullImageForUpload,
  createThumbnailForUpload,
} from "../../lib/imageVariants";
import CommentLibrary from "../../components/CommentLibrary";
import OfflineSyncStatus from "../../components/OfflineSyncStatus";
import EquipmentCard from "../../components/EquipmentCard";
import AISecondInspector, {
  type AISuggestion,
} from "../../components/AISecondInspector";
import InspectionCopilotPanel from "../../components/InspectionCopilotPanel";
import OfflineReportViewer from "../../components/OfflineReportViewer";
import AILiveInspectionCamera from "../../components/AILiveInspectionCamera";
import type {
  CaptureCategory,
  CaptureDraft,
} from "../../lib/ai/captureTypes";
import FieldCamera from "../../components/FieldCamera";
import PhotoMarkupEditor from "../../components/PhotoMarkupEditor";
import VoiceOnlyInspectionMode from "../../components/VoiceOnlyInspectionMode";
import LiveSectionCoach from "../../components/LiveSectionCoach";
import {
  addOfflineQueueItem,
  filesToOfflinePhotos,
  getOfflineQueueSummary,
  isOnline,
  startOfflineQueueAutoSync,
} from "../../lib/offlineSyncQueue";
import {
  cacheReportsForOffline,
  getCachedInspectionPreload,
  getCachedReportsForOffline,
  getInspectionLabel,
  saveInspectionPreload,
  saveSyncCompletionNotice,
} from "../../lib/offlineInspectionPreload";

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

type PhotoType = "finding" | "existing_finding" | "reference_photo" | "limitation";

type UploadedPhoto = {
  publicUrl: string;
  filePath: string;
  isVideo?: boolean;
  mimeType?: string;
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
};

type ExistingFindingMedia = {
  id: string | number;
  finding_id?: string | number | null;
  public_url?: string | null;
  signed_url?: string | null;
  file_path?: string | null;
  storage_path?: string | null;
  thumbnail_url?: string | null;
  thumbnail_path?: string | null;
  mime_type?: string | null;
  is_video?: boolean | null;
  created_at?: string | null;
};

type AIMediaGroup = {
  id: string;
  label: string;
  photoIndexes: number[];
  classification:
    | "finding"
    | "reference"
    | "equipment"
    | "limitation"
    | "unassigned";
  section: string;
  severity: string;
  title: string;
  observation: string;
  implication: string;
  recommendation: string;
  confidence: number;
};

type UploadProgressItem = {
  id: string;
  name: string;
  type: "photo" | "video" | "thumbnail" | "offline";
  stage: string;
  progress: number;
  status: "pending" | "processing" | "uploading" | "queued" | "done" | "error";
};

const FIELD_BACKGROUND_SYNC_EVENT = "opi:offline-sync-complete";
const FIELD_BACKGROUND_SYNC_KEY = "opi-offline-sync-complete-at";

function notifyFieldBackgroundSyncComplete() {
  if (typeof window === "undefined") return;

  const syncedAt = new Date().toISOString();
  window.localStorage.setItem(FIELD_BACKGROUND_SYNC_KEY, syncedAt);
  window.dispatchEvent(
    new CustomEvent(FIELD_BACKGROUND_SYNC_EVENT, {
      detail: { syncedAt },
    }),
  );
}

function isVideoFile(file: File) {
  return String(file?.type || "").startsWith("video/");
}

function isImageFile(file: File) {
  return String(file?.type || "").startsWith("image/");
}

function createLocalMediaId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}


const OFFLINE_LOCAL_STORAGE_SOFT_LIMIT_BYTES = 6 * 1024 * 1024;
const OFFLINE_RAW_IMAGE_SOFT_LIMIT_BYTES = 35 * 1024 * 1024;

function getOfflineStorableFiles(files: File[]) {
  const storable: File[] = [];
  const skipped: File[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const isImage = isImageFile(file);
    const isVideo = isVideoFile(file);
    const fileSize = Number(file.size || 0);

    // Videos are not safe for browser localStorage. Keep the original on the phone
    // and queue the finding text. Images are compressed later by filesToOfflinePhotos,
    // so do not reject normal iPhone/gallery photos just because the raw file is large.
    if (!isImage || isVideo || fileSize > OFFLINE_RAW_IMAGE_SOFT_LIMIT_BYTES) {
      skipped.push(file);
      continue;
    }

    if (storable.length >= 6) {
      skipped.push(file);
      continue;
    }

    storable.push(file);
    totalBytes += fileSize;
  }

  return { storable, skipped, totalBytes };
}

async function prepareOfflinePhotosForQueue(files: File[]) {
  const { storable, skipped } = getOfflineStorableFiles(files);

  if (storable.length === 0) {
    return {
      offlinePhotos: [],
      skipped,
      skippedCount: skipped.length,
      skippedVideos: skipped.filter((file) => file.type.startsWith("video/")).length,
      quotaHit: false,
    };
  }

  try {
    const offlinePhotos = await filesToOfflinePhotos(storable);

    return {
      offlinePhotos,
      skipped,
      skippedCount: skipped.length,
      skippedVideos: skipped.filter((file) => file.type.startsWith("video/")).length,
      quotaHit: false,
    };
  } catch (error: any) {
    const text = String(error?.message || error?.name || error || "").toLowerCase();
    const quotaHit =
      text.includes("quota") ||
      text.includes("storage") ||
      text.includes("exceeded") ||
      text.includes("localstorage");

    // Never let media storage failure block the actual finding from being queued.
    // iPhone Safari/Capacitor WebView storage can be very small, especially after
    // prior failed base64 video/photo attempts. The rough finding text still needs
    // to be saved so AI can polish it after sync.
    return {
      offlinePhotos: [],
      skipped: [...storable, ...skipped],
      skippedCount: files.length,
      skippedVideos: files.filter((file) => file.type.startsWith("video/")).length,
      quotaHit,
    };
  }
}

function getOfflineMediaSkipMessage(skippedCount: number, skippedVideos: number) {
  if (skippedCount <= 0) return "";

  if (skippedVideos > 0) {
    return ` ${skippedVideos} video${skippedVideos === 1 ? "" : "s"} could not be stored in the browser offline queue. The original video remains in your iPhone Photos; attach it after service returns.`;
  }

  return ` ${skippedCount} media file${skippedCount === 1 ? "" : "s"} were too large for the browser offline queue. Attach them after service returns.`;
}

const AI_IMAGE_MAX_SIZE = 1400;
const AI_IMAGE_QUALITY = 0.72;

function loadImageForAiCompression(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error("AI could not read that photo. Try choosing a JPG photo."),
      );
    };

    image.src = objectUrl;
  });
}

async function compressImageForAiUpload(file: File) {
  const image = await loadImageForAiCompression(file);
  const longestSide = Math.max(image.width, image.height);
  const scale = Math.min(1, AI_IMAGE_MAX_SIZE / longestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("AI could not prepare that photo.");

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", AI_IMAGE_QUALITY);
  });

  if (!blob) throw new Error("AI could not compress that photo.");

  return new File(
    [blob],
    `ai-photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    {
      type: "image/jpeg",
      lastModified: Date.now(),
    },
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not prepare photo for AI Report Writer 3.0."));
    };
    reader.onerror = () => reject(new Error("Could not read photo for AI Report Writer 3.0."));
    reader.readAsDataURL(file);
  });
}

async function createVideoThumbnailForUpload(file: File): Promise<File | null> {
  if (!file.type.startsWith("video/")) return null;

  return await new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    let settled = false;

    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timeout = window.setTimeout(() => {
      finish(null);
    }, 3500);

    const finishWith = (result: File | null) => {
      window.clearTimeout(timeout);
      finish(result);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    video.onerror = () => finishWith(null);

    video.onloadedmetadata = () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const targetTime = Math.min(Math.max(duration * 0.25, 0.25), 2);

        if (!Number.isFinite(targetTime) || targetTime <= 0) {
          video.currentTime = 0;
          return;
        }

        video.currentTime = targetTime;
      } catch {
        finishWith(null);
      }
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          finishWith(null);
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finishWith(null);
              return;
            }

            finishWith(
              new File([blob], `video-thumb-${Date.now()}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              }),
            );
          },
          "image/jpeg",
          0.78,
        );
      } catch {
        finishWith(null);
      }
    };
  });
}

export type EquipmentResult = {
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  estimatedAge?: string | number;
  expectedServiceLife?: string;
  maintenanceSchedule?: string;
  recallAwareness?: string;
  knownFailurePatterns?: string[];
  replacementCostEstimate?: string;
  lifeExpectancyPercent?: number;
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

function meaningfulEquipmentValue(value: any) {
  return cleanEquipmentValue(value);
}

function shouldCreateEquipmentFinding(result: EquipmentResult) {
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
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();
  const maintenance = String(result.maintenanceLevel || "").toLowerCase();
  const explicit = meaningfulEquipmentValue(result.equipmentStatus);

  if (result.intelligenceFlags?.problemPanelDetected) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (result.intelligenceFlags?.r22Detected) {
    return "⚠ Service / Replacement Planning Recommended";
  }

  if (condition.includes("failed") || condition.includes("not operating")) {
    return "⚠ Service Recommended";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "⚠ Monitor Due To Age";
  }

  if (severity.includes("major") || severity.includes("safety")) {
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

  if (explicit) {
    const lowerExplicit = explicit.toLowerCase();

    if (
      lowerExplicit.includes("older equipment") ||
      lowerExplicit.includes("monitor")
    ) {
      return "⚠ Monitor Due To Age";
    }

    if (
      lowerExplicit.includes("no specific") ||
      lowerExplicit.includes("operating normally")
    ) {
      return "✓ No Specific Deficiency Noted";
    }

    return explicit;
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
  const capacity = meaningfulEquipmentValue(
    result.capacity || result.estimatedBTU,
  );
  const fuelType = meaningfulEquipmentValue(result.fuelType);
  const condition = meaningfulEquipmentValue(
    cleanServiceLifeCondition(result.condition),
  );

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
    const capacityText = capacity
      .replace(/(\d+)\s*gallons?/i, "$1-gallon")
      .replace(/\s+capacity$/i, "");
    detailParts.push(capacityText);
  }

  if (fuelType) {
    detailParts.push(`${fuelType.toLowerCase()} unit`);
  }

  if (refrigerant && isHvacEquipment(result)) {
    detailParts.push(`${refrigerant} refrigerant`);
  }

  if (detailParts.length > 0) {
    sentences.push(detailParts.join(" ").replace(/\s+/g, " ").trim() + ".");
  }

  if (
    condition &&
    condition.toLowerCase() !== "no specific deficiency noted" &&
    !condition.toLowerCase().includes("industry estimate")
  ) {
    const lowerCondition = condition.toLowerCase();

    if (
      lowerCondition.includes("older equipment") ||
      lowerCondition.includes("monitor") ||
      lowerCondition.includes("budget")
    ) {
      sentences.push(
        "Older equipment. The unit was operating at the time of inspection. Monitor performance and budget for future replacement as part of normal ownership planning.",
      );
    } else {
      sentences.push(condition.endsWith(".") ? condition : `${condition}.`);
    }
  } else {
    sentences.push(
      "No significant deficiencies were observed at the time of inspection.",
    );
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

function getFindingTitlePrefix(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();

  if (condition.includes("unsafe") || severity.includes("safety")) {
    return "Safety Concern";
  }

  if (condition.includes("failed") || condition.includes("not operating")) {
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
      observation.toLowerCase().includes("no specific") ||
      observation.toLowerCase().includes("operational")
    ) {
      return "Equipment appeared functional at the time of inspection with no significant visible deficiencies noted.";
    }
  }

  return (
    observation || "Equipment condition was documented during the inspection."
  );
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
    return "The equipment is older and may require increased maintenance over time. While functional at the time of inspection, budgeting for eventual replacement is prudent.";
  }

  return (
    implication ||
    "Deferred maintenance or component wear may affect reliable operation over time."
  );
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
    return (
      recommendation ||
      "Further evaluation, repair, or replacement is recommended by a qualified contractor."
    );
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "Continue routine maintenance and monitor performance. Budgeting for future replacement should be anticipated as the equipment continues to age.";
  }

  return (
    recommendation ||
    "Routine maintenance is recommended in accordance with manufacturer guidelines."
  );
}

export default function FieldPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0f172a] p-10 text-white">
          Loading field workflow...
        </main>
      }
    >
      <FieldPageContent />
    </Suspense>
  );
}

function isNativeCapacitorApp() {
  if (typeof window === "undefined") return false;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Fall back to the global Capacitor bridge below.
  }

  const capacitor = (window as any).Capacitor;
  const platform = capacitor?.getPlatform?.();

  return Boolean(
    capacitor?.isNativePlatform?.() ||
    platform === "ios" ||
    platform === "android" ||
    platform === "iphone" ||
    platform === "ipad",
  );
}

function safeSectionFolder(section: string) {
  return section
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function FieldPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportFromUrl =
    searchParams.get("report") || searchParams.get("inspection_id") || "";
  const returnToFromUrl = searchParams.get("return_to") || "";

  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState(reportFromUrl || "");
  const [photoType, setPhotoType] = useState<PhotoType>("finding");
  const [existingFindings, setExistingFindings] = useState<any[]>([]);
  const [existingFindingId, setExistingFindingId] = useState("");
  const [existingFindingSearch, setExistingFindingSearch] = useState("");
  const [loadingExistingFindings, setLoadingExistingFindings] = useState(false);
  const [existingFindingMedia, setExistingFindingMedia] = useState<
    ExistingFindingMedia[]
  >([]);
  const [loadingExistingFindingMedia, setLoadingExistingFindingMedia] =
    useState(false);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [note, setNote] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [markupPhotoIndex, setMarkupPhotoIndex] = useState<number | null>(null);
  const [markupPhotoUrl, setMarkupPhotoUrl] = useState("");
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [analyzingLimitation, setAnalyzingLimitation] = useState(false);
  const limitationAutoAnalyzedRef = useRef("");
  const [analyzingEquipment, setAnalyzingEquipment] = useState(false);
  const [equipmentResult, setEquipmentResult] =
    useState<EquipmentResult | null>(null);
  const [savingEquipment, setSavingEquipment] = useState(false);
  const [equipmentSaveLabel, setEquipmentSaveLabel] = useState(
    "Save To Equipment Inventory",
  );
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>(
    [],
  );
  const [organizingMedia, setOrganizingMedia] = useState(false);
  const [savingOrganizedMedia, setSavingOrganizedMedia] = useState(false);
  const [mediaGroups, setMediaGroups] = useState<AIMediaGroup[]>([]);
  const [mediaOrganizerOpen, setMediaOrganizerOpen] = useState(false);
  const [takingNativePhoto, setTakingNativePhoto] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [showOfflineReportViewer, setShowOfflineReportViewer] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [queueTick, setQueueTick] = useState(0);
  const voiceRecognitionRef = useRef<any>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceStopRequestedRef = useRef(false);
  const swipeStartXRef = useRef(0);
  const swipeStartYRef = useRef(0);
  const swipeBackTriggeredRef = useRef(false);

  const [nativeApp, setNativeApp] = useState(false);
  const [voiceOnlyOpen, setVoiceOnlyOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState<
    "live" | "coach" | "copilot" | "review"
  >("live");

  useEffect(() => {
    setNativeApp(isNativeCapacitorApp());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stopAutoSync = startOfflineQueueAutoSync({
      intervalMs: 30000,
      onSynced: (result) => {
        if (result.synced > 0) {
          notifyFieldBackgroundSyncComplete();
          setQueueTick((current) => current + 1);

          const syncedFindings = (result.syncedItems || []).filter(
            (entry: any) => entry?.item?.type === "finding",
          );
          const aiProcessed = syncedFindings.filter(
            (entry: any) => entry?.result?.ai_after_sync?.ran,
          ).length;
          const firstInspectionId =
            syncedFindings[0]?.item?.payload?.inspection_id || selectedReport || "";
          const cached = firstInspectionId
            ? getCachedInspectionPreload(String(firstInspectionId))
            : null;
          const matchedReport = reports.find(
            (report: any) => String(report.id) === String(firstInspectionId),
          );
          const label =
            cached?.inspection?.label ||
            (matchedReport ? getInspectionLabel(matchedReport) : "") ||
            "Inspection";

          const notice =
            result.failed > 0
              ? `Background sync finished for ${label}. ${result.synced} synced, ${result.failed} still waiting.`
              : `${label} synced — ${result.synced} item${result.synced === 1 ? "" : "s"} uploaded${aiProcessed > 0 ? `, ${aiProcessed} processed by AI` : ""}.`;

          saveSyncCompletionNotice({
            inspectionId: String(firstInspectionId || ""),
            label,
            synced: result.synced,
            failed: result.failed,
            aiProcessed,
          });

          setSyncNotice(notice);
          setMessage(notice);
        }
      },
      onFailed: () => {
        setQueueTick((current) => current + 1);
      },
    });

    return stopAutoSync;
  }, [reports, selectedReport]);
  const offlineSummary = useMemo(
    () => getOfflineQueueSummary(),
    [message, photos.length, online, queueTick],
  );

  const selectedOfflinePreload = useMemo(() => {
    if (!selectedReport) return null;
    return getCachedInspectionPreload(selectedReport);
  }, [selectedReport, reports, queueTick]);

  function setMediaProgress(
    id: string,
    patch: Partial<UploadProgressItem> &
      Pick<UploadProgressItem, "name" | "type">,
  ) {
    setUploadProgress((current) => {
      const existing = current.find((item) => item.id === id);

      if (!existing) {
        return [
          ...current,
          {
            id,
            name: patch.name,
            type: patch.type,
            stage: patch.stage || "Waiting",
            progress: patch.progress ?? 0,
            status: patch.status || "pending",
          },
        ];
      }

      return current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              name: patch.name || item.name,
              type: patch.type || item.type,
            }
          : item,
      );
    });
  }

  function clearCompletedProgressSoon() {
    window.setTimeout(() => {
      setUploadProgress((current) =>
        current.filter(
          (item) => item.status !== "done" && item.status !== "queued",
        ),
      );
    }, 2500);
  }

  useEffect(() => {
    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;

      swipeStartXRef.current = touch.clientX;
      swipeStartYRef.current = touch.clientY;
      swipeBackTriggeredRef.current = false;
    }

    function handleTouchMove(event: TouchEvent) {
      if (swipeBackTriggeredRef.current) return;

      const touch = event.touches[0];
      if (!touch) return;

      const startX = swipeStartXRef.current;
      const startY = swipeStartYRef.current;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      const startedAtLeftEdge = startX <= 32;
      const strongRightSwipe =
        deltaX > 85 && Math.abs(deltaY) < 60 && deltaX > Math.abs(deltaY) * 1.5;

      if (!startedAtLeftEdge || !strongRightSwipe) return;

      const target =
        returnToFromUrl || (selectedReport ? `/reports/${selectedReport}` : "");
      if (!target) return;

      swipeBackTriggeredRef.current = true;

      if (!isOnline() && selectedReport && target.startsWith("/reports/")) {
        setShowOfflineReportViewer(true);
        return;
      }

      router.push(target);
    }

    function handleTouchEnd() {
      swipeBackTriggeredRef.current = false;
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [returnToFromUrl, selectedReport, router]);

  useEffect(() => {
    setOnline(isOnline());
    loadReports();

    function handleOnline() {
      setOnline(true);
      setQueueTick((current) => current + 1);
    }

    function handleOffline() {
      setOnline(false);
      setQueueTick((current) => current + 1);
    }

    function handleQueueChange() {
      setQueueTick((current) => current + 1);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("on-point-offline-queue-change", handleQueueChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        "on-point-offline-queue-change",
        handleQueueChange,
      );
    };
  }, []);

  async function loadReports() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      const cachedReports = getCachedReportsForOffline();
      if (cachedReports.length > 0) {
        setReports(cachedReports.map((item: any) => item.raw || item));
        setMessage(
          "Loaded cached inspections for offline use. Some live details may update when service returns.",
        );
        return;
      }

      setMessage(error.message);
      return;
    }

    const nextReports = data || [];
    setReports(nextReports);
    cacheReportsForOffline(nextReports);

    if (selectedReport) {
      const selectedInspection = nextReports.find(
        (report: any) => String(report.id) === String(selectedReport),
      );

      saveInspectionPreload({
        inspectionId: selectedReport,
        inspection: selectedInspection,
        reports: nextReports,
        comments: [],
        templates: [],
        sections: SECTIONS,
        findings: [],
        clientInfo: selectedInspection || {},
      });
    }
  }

  useEffect(() => {
    if (!selectedReport || reports.length === 0) return;

    const selectedInspection = reports.find(
      (report: any) => String(report.id) === String(selectedReport),
    );

    saveInspectionPreload({
      inspectionId: selectedReport,
      inspection: selectedInspection,
      reports,
      comments: [],
      templates: [],
      sections: SECTIONS,
      findings: [],
      clientInfo: selectedInspection || {},
    });
  }, [selectedReport, reports]);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingFindings() {
      setExistingFindingId("");
      setExistingFindingSearch("");

      if (!selectedReport || !isOnline()) {
        setExistingFindings([]);
        return;
      }

      setLoadingExistingFindings(true);
      const { data, error } = await supabase
        .from("findings")
        .select("id, title, section, severity, image_url, created_at")
        .eq("inspection_id", selectedReport)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setExistingFindings(error ? [] : data || []);
        setLoadingExistingFindings(false);
        if (error) setMessage(`Could not load existing findings: ${error.message}`);
      }
    }

    void loadExistingFindings();
    return () => {
      cancelled = true;
    };
  }, [selectedReport, queueTick]);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingFindingMedia() {
      setExistingFindingMedia([]);

      if (
        photoType !== "existing_finding" ||
        !selectedReport ||
        !existingFindingId ||
        !isOnline()
      ) {
        return;
      }

      setLoadingExistingFindingMedia(true);

      const { data, error } = await supabase
        .from("photos")
        .select(
          "id, finding_id, public_url, signed_url, file_path, storage_path, thumbnail_url, thumbnail_path, mime_type, is_video, created_at",
        )
        .eq("inspection_id", selectedReport)
        .eq("finding_id", existingFindingId)
        .order("created_at", { ascending: true });

      if (!cancelled) {
        setExistingFindingMedia(error ? [] : ((data || []) as ExistingFindingMedia[]));
        setLoadingExistingFindingMedia(false);

        if (error) {
          setMessage(`Could not load finding media: ${error.message}`);
        }
      }
    }

    void loadExistingFindingMedia();

    return () => {
      cancelled = true;
    };
  }, [photoType, selectedReport, existingFindingId, queueTick]);

  const filteredExistingFindings = useMemo(() => {
    const query = existingFindingSearch.trim().toLowerCase();

    return existingFindings.filter((finding) => {
      if (!query) return true;

      return `${finding.title || ""} ${finding.section || ""} ${
        finding.severity || ""
      }`
        .toLowerCase()
        .includes(query);
    });
  }, [existingFindings, existingFindingSearch]);

  const groupedExistingFindings = useMemo(() => {
    const groups = new Map<string, any[]>();

    filteredExistingFindings.forEach((finding) => {
      const group = String(finding.section || "General");
      const current = groups.get(group) || [];
      current.push(finding);
      groups.set(group, current);
    });

    return Array.from(groups.entries());
  }, [filteredExistingFindings]);

  const selectedExistingFinding = useMemo(
    () =>
      existingFindings.find(
        (finding) => String(finding.id) === String(existingFindingId),
      ) || null,
    [existingFindings, existingFindingId],
  );

  const cameraDestinationLabel = useMemo(() => {
    if (photoType === "existing_finding") {
      return selectedExistingFinding?.title
        ? `Existing Finding: ${selectedExistingFinding.title}`
        : "Existing Finding — select one first";
    }

    if (photoType === "reference_photo") {
      return `Reference Photos: ${section}`;
    }

    if (photoType === "limitation") {
      return `Section Limitation: ${section}`;
    }

    return `New Finding: ${section}`;
  }, [photoType, selectedExistingFinding, section]);

  function resetForm() {
    setTitle("");
    setPhotoType("finding");
    setExistingFindingId("");
    setExistingFindingSearch("");
    setExistingFindingMedia([]);
    limitationAutoAnalyzedRef.current = "";
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setNote("");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setPhotos([]);
    setMarkupPhotoIndex(null);
    setMarkupPhotoUrl("");
    setEquipmentResult(null);
    setEquipmentSaveLabel("Save To Equipment Inventory");
    setAiSuggestions([]);
    setUploadProgress((current) =>
      current.filter(
        (item) => item.status === "uploading" || item.status === "processing",
      ),
    );
    setQueueTick((current) => current + 1);
  }

  function useComment(comment: any) {
    setPhotoType("finding");
    setTitle(comment.title || "");
    setSection(comment.section || "Exterior");
    setSeverity(comment.severity || "Recommended Repair");
    setObservation(comment.observation || "");
    setImplication(comment.implication || "");
    setRecommendation(comment.recommendation || "");
    setMessage("Comment loaded into the field form.");
  }

  function setFindingMode() {
    setPhotoType("finding");
    setExistingFindingId("");
    setExistingFindingSearch("");
    setExistingFindingMedia([]);
    limitationAutoAnalyzedRef.current = "";
    setSeverity((current) =>
      current === "Informational" ? "Recommended Repair" : current,
    );
    setMessage("Finding / Defect mode selected.");
  }

  function setExistingFindingMode() {
    setPhotoType("existing_finding");
    setExistingFindingMedia([]);
    setTitle("");
    setSeverity("Informational");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setMessage("Select an existing finding, then add photos or videos.");
  }

  function setReferencePhotoMode() {
    setPhotoType("reference_photo");
    setExistingFindingId("");
    setExistingFindingSearch("");
    setExistingFindingMedia([]);
    limitationAutoAnalyzedRef.current = "";
    setTitle("");
    setSeverity("Informational");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setMessage(
      "Reference photo mode selected. Add photo(s), choose a section, and save.",
    );
  }

  function setLimitationMode() {
    setPhotoType("limitation");
    limitationAutoAnalyzedRef.current = "";
    setExistingFindingId("");
    setExistingFindingSearch("");
    setExistingFindingMedia([]);
    setTitle("");
    setSeverity("Informational");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setMessage(
      "Section limitation mode selected. Choose a section, enter the limitation wording, then capture or choose one photo.",
    );
  }

  function handleWorkflowChange(nextType: PhotoType) {
    if (nextType === "existing_finding") {
      setExistingFindingMode();
      return;
    }

    if (nextType === "reference_photo") {
      setReferencePhotoMode();
      return;
    }

    if (nextType === "limitation") {
      setLimitationMode();
      return;
    }

    setFindingMode();
  }

  function addFiles(nextFiles: File[]) {
    const validFiles = nextFiles.filter((file) => {
      if (photoType === "reference_photo" || photoType === "limitation") {
        return file.type.startsWith("image/");
      }

      return file.type.startsWith("image/") || file.type.startsWith("video/");
    });

    if (validFiles.length !== nextFiles.length) {
      setMessage(
        photoType === "reference_photo"
          ? "Reference photos must be images. Videos can be saved as finding media."
          : photoType === "limitation"
            ? "Limitation evidence currently supports photos. Videos were skipped."
            : "Some files were skipped because they were not supported media.",
      );
    }

    setEquipmentResult(null);
    setPhotos((current) =>
      photoType === "limitation"
        ? validFiles.slice(0, 1)
        : [...current, ...validFiles].slice(0, 6),
    );

    if (photoType === "limitation") {
      const limitationPhoto = validFiles.find((file) =>
        file.type.startsWith("image/"),
      );

      if (limitationPhoto) {
        window.setTimeout(() => {
          void analyzeLimitationPhotoWithAI(limitationPhoto, {
            automatic: true,
          });
        }, 0);
      }
    }

    if (validFiles.some((file) => file.type.startsWith("video/"))) {
      setMessage(
        nativeApp
          ? "Video added. Keep the original in iPhone Photos as the native backup. The app will attach it to the report with upload status and retry protection."
          : "Video added. The app will attach it to the report with upload status.",
      );
    }
  }

  useEffect(() => {
    if (markupPhotoIndex === null) {
      setMarkupPhotoUrl("");
      return;
    }

    const file = photos[markupPhotoIndex];

    if (!file || !file.type.startsWith("image/")) {
      setMarkupPhotoIndex(null);
      setMarkupPhotoUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setMarkupPhotoUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [markupPhotoIndex, photos]);

  function openPhotoMarkup(index: number) {
    const file = photos[index];

    if (!file?.type.startsWith("image/")) {
      setMessage("Only photos can be marked up.");
      return;
    }

    setMarkupPhotoIndex(index);
  }

  async function saveFieldPhotoMarkup(
    _items: any[],
    flattenedDataUrl: string,
  ) {
    if (markupPhotoIndex === null || savingMarkup) return;

    setSavingMarkup(true);

    try {
      const original = photos[markupPhotoIndex];

      if (!original) {
        throw new Error("The selected photo is no longer available.");
      }

      const response = await fetch(flattenedDataUrl);
      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("The marked-up photo was empty.");
      }

      const originalBaseName = String(original.name || "field-photo")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 70);

      const markedFile = new File(
        [blob],
        `${originalBaseName}-marked.jpg`,
        {
          type: "image/jpeg",
          lastModified: Date.now(),
        },
      );

      setPhotos((current) =>
        current.map((file, index) =>
          index === markupPhotoIndex ? markedFile : file,
        ),
      );

      setMarkupPhotoIndex(null);
      setMarkupPhotoUrl("");
      setMessage(
        "Photo markup saved. The marked-up copy will be used when this Field Tool item is saved.",
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not save the photo markup.");
      throw error;
    } finally {
      setSavingMarkup(false);
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function getImagesForAi() {
    return photos
      .filter((photo) => photo.type.startsWith("image/"))
      .slice(0, 6);
  }

  function applyAiFinding(data: any) {
    setPhotoType("finding");
    setTitle(data.title || data.suggested_title || data.defect_title || "");
    setObservation(
      data.observation ||
        data.clientComment ||
        data.client_comment ||
        data.comment ||
        "",
    );
    setImplication(
      data.implication || data.impact || data.why_it_matters || "",
    );
    setRecommendation(
      data.recommendation || data.recommended_action || data.action || "",
    );

    const nextSection =
      data.section || data.suggested_section || section || "Exterior";
    const nextSeverity =
      data.severity ||
      data.suggested_severity ||
      severity ||
      "Recommended Repair";

    setSection(SECTIONS.includes(nextSection) ? nextSection : section);
    setSeverity(SEVERITIES.includes(nextSeverity) ? nextSeverity : severity);
  }

  function addAiSuggestion(suggestion: Omit<AISuggestion, "id" | "createdAt">) {
    const id = `${suggestion.source}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    setAiSuggestions((current) =>
      [
        {
          ...suggestion,
          id,
          createdAt: Date.now(),
        },
        ...current,
      ].slice(0, 6),
    );
  }

  function ignoreAiSuggestion(suggestionId: string) {
    setAiSuggestions((current) =>
      current.filter((suggestion) => suggestion.id !== suggestionId),
    );
  }

  function acceptAiSuggestion(suggestion: AISuggestion) {
    setPhotoType("finding");

    if (suggestion.title) setTitle(suggestion.title);

    if (suggestion.section && SECTIONS.includes(suggestion.section)) {
      setSection(suggestion.section);
    }

    if (suggestion.severity && SEVERITIES.includes(suggestion.severity)) {
      setSeverity(suggestion.severity);
    }

    if (suggestion.summary && !observation.trim()) {
      setObservation(suggestion.summary);
    }

    if (suggestion.recommendation && !recommendation.trim()) {
      setRecommendation(suggestion.recommendation);
    }

    setMessage("AI suggestion accepted. Review and edit before saving.");
    ignoreAiSuggestion(suggestion.id);
  }

  async function handleCameraAccept(
    category: CaptureCategory,
    draft: CaptureDraft,
    file: File,
  ) {
    if (category === "finding" && draft.kind === "finding") {
      const effectiveSection = SECTIONS.includes(draft.section)
        ? draft.section
        : section;
      const effectiveSeverity = SEVERITIES.includes(draft.severity)
        ? draft.severity
        : severity;

      setPhotoType("finding");
      setPhotos([file]);
      setTitle(draft.title || "");
      setSection(effectiveSection);
      setSeverity(effectiveSeverity);
      setNote("");
      setObservation(draft.observation || "");
      setImplication(draft.implication || "");
      setRecommendation(draft.recommendation || "");

      await saveFindingOnline({
        photos: [file],
        title: draft.title || "",
        note: "",
        section: effectiveSection,
        severity: effectiveSeverity,
        observation: draft.observation || "",
        implication: draft.implication || "",
        recommendation: draft.recommendation || "",
      });
      resetForm();
      return;
    }

    if (category === "limitation" && draft.kind === "limitation") {
      if (!file.type.startsWith("image/")) {
        throw new Error(
          "Limitations need a photo, not a video - retake using PHOTO mode.",
        );
      }

      const effectiveSection = SECTIONS.includes(draft.section)
        ? draft.section
        : section;

      setPhotoType("limitation");
      setPhotos([file]);
      setTitle(draft.title || "");
      setSection(effectiveSection);
      setNote(draft.limitation || "");
      setRecommendation(draft.recommendation || "");

      await saveLimitationWithPhotoOnline({
        photos: [file],
        title: draft.title || "",
        note: draft.limitation || "",
        section: effectiveSection,
        recommendation: draft.recommendation || "",
      });
      resetForm();
      return;
    }

    if (category === "equipment" && draft.kind === "equipment") {
      const equipmentDraft = draft as unknown as EquipmentResult;

      setPhotoType("finding");
      setPhotos([file]);
      setEquipmentResult(equipmentDraft);

      await saveEquipmentFromFieldTool({
        photos: [file],
        equipmentResult: equipmentDraft,
      });
      return;
    }
  }

  async function analyzeLimitationPhotoWithAI(
    imageOverride?: File,
    options: { automatic?: boolean } = {},
  ) {
    if (
      analyzingLimitation ||
      analyzingPhoto ||
      analyzingEquipment ||
      generating ||
      saving ||
      savingEquipment
    ) {
      return;
    }

    if (photoType !== "limitation") return;

    if (!online) {
      if (!options.automatic) {
        setMessage(
          "AI limitation drafting needs internet. Your photo and wording remain available.",
        );
      }
      return;
    }

    const image =
      imageOverride ||
      photos.find((photo) => photo.type.startsWith("image/"));

    if (!image) {
      if (!options.automatic) {
        setMessage("Add a limitation photo before asking AI to draft the wording.");
      }
      return;
    }

    const mediaKey = createLocalMediaId(image);
    if (options.automatic && limitationAutoAnalyzedRef.current === mediaKey) {
      return;
    }

    limitationAutoAnalyzedRef.current = mediaKey;
    setAnalyzingLimitation(true);
    setMessage("AI is reviewing the photo and drafting the limitation...");

    try {
      const prepared = await compressImageForAiUpload(image);
      const imageDataUrl = await fileToDataUrl(prepared);

      const response = await fetch("/api/ai/live-inspection-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          imageDataUrl,
          inspectionId: selectedReport,
          currentSection: section,
          currentSeverity: "Informational",
          mode: "limitation_draft",
          inspectorIntent:
            "Draft a concise, professional home-inspection limitation based only on visible access, obstruction, stored belongings, vegetation, snow, unsafe conditions, or concealed areas. Do not invent a defect.",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "AI limitation drafting failed.");
      }

      const limitation = Array.isArray(data?.limitations)
        ? data.limitations[0]
        : null;

      const fallbackSuggestion = Array.isArray(data?.suggestions)
        ? data.suggestions.find((item: any) => {
            const combined = `${item?.title || ""} ${item?.observation || ""} ${
              item?.recommendation || ""
            }`.toLowerCase();

            return /(limited|limitation|obstruct|blocked|stored|belongings|access|not visible|concealed|snow|vegetation|unsafe)/.test(
              combined,
            );
          })
        : null;

      const nextSection = String(
        limitation?.section || fallbackSuggestion?.section || section,
      ).trim();

      const nextTitle = String(
        limitation?.title ||
          fallbackSuggestion?.title ||
          "Inspection Access Limited",
      ).trim();

      const nextWording = String(
        limitation?.limitation ||
          limitation?.reason ||
          fallbackSuggestion?.observation ||
          data?.summary ||
          "",
      ).trim();

      const nextRecommendation = String(
        limitation?.recommendation ||
          fallbackSuggestion?.recommendation ||
          "",
      ).trim();

      if (!nextWording) {
        throw new Error(
          "AI could not confidently identify a limitation from this photo. Enter the wording manually or take a clearer photo showing the obstruction.",
        );
      }

      if (SECTIONS.includes(nextSection)) {
        setSection(nextSection);
      }

      setTitle(nextTitle);
      setNote(nextWording);
      setRecommendation(nextRecommendation);
      setMessage(
        "AI drafted the limitation from the photo. Review or edit the wording before saving.",
      );
    } catch (error: any) {
      limitationAutoAnalyzedRef.current = "";
      setMessage(
        error?.message ||
          "AI could not draft the limitation. You can still enter it manually.",
      );
    } finally {
      setAnalyzingLimitation(false);
    }
  }

  async function analyzePhotoWithAI() {
    if (
      analyzingPhoto ||
      analyzingEquipment ||
      generating ||
      saving ||
      savingEquipment
    )
      return;

    if (!online) {
      setMessage(
        "Photo AI needs internet. Save the finding offline, then run AI when service returns.",
      );
      return;
    }

    if (photoType === "reference_photo") {
      setMessage(
        "Switch to Finding / Defect mode before analyzing a defect photo.",
      );
      return;
    }

    const images = getImagesForAi();

    if (!images.length) {
      setMessage(
        "Add or take at least one photo before using Analyze Photo(s). Videos can still be saved, but AI needs at least one still photo to analyze.",
      );
      return;
    }

    setAnalyzingPhoto(true);
    setMessage("");

    try {
      setMessage("Preparing photo for AI...");

      const aiImages = await Promise.all(
        images.map((image) => compressImageForAiUpload(image)),
      );

      const formData = new FormData();
      aiImages.forEach((image) => {
        formData.append("images", image);
      });
      formData.append("inspectionId", selectedReport || "");
      formData.append("note", note);
      formData.append("section", section);
      formData.append("severity", severity);

      const res = await fetch("/api/ai/defect-recognition", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "AI photo analysis failed.");
        return;
      }

      applyAiFinding(data);

      addAiSuggestion({
        source: "defect",
        title: data.title || "AI Photo Finding",
        section: data.section || section,
        severity: data.severity || severity,
        confidence: Number(data.confidence || data.confidenceScore || 82),
        summary:
          data.observation ||
          data.summary ||
          "AI identified a possible report finding from the selected photo(s).",
        reasoning: [
          data.photoQuality ? `Photo quality: ${data.photoQuality}` : "",
          data.reasoning || "",
          ...(Array.isArray(data.evidence) ? data.evidence.slice(0, 2) : []),
        ].filter(Boolean),
        recommendation:
          data.recommendation ||
          "Review the AI finding and edit before saving.",
      });

      setMessage(
        images.length === 1
          ? "AI analyzed the photo. Review and edit the finding before saving."
          : `AI analyzed ${images.length} photos together. Review and edit the finding before saving.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "AI photo analysis failed.");
    } finally {
      setAnalyzingPhoto(false);
    }
  }

  async function takeNativePhotoAndSaveToGallery() {
    if (takingNativePhoto) return;

    if (!nativeApp) {
      setMessage(
        "Use Take Photos or Choose Photos on web. Native gallery saving works inside the iOS app.",
      );
      return;
    }

    setTakingNativePhoto(true);
    setMessage("");

    try {
      const cameraModule = await import("@capacitor/camera");
      const { Camera, CameraResultType, CameraSource } = cameraModule;

      const image = await Camera.getPhoto({
        quality: 82,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
      });

      let blob: Blob | null = null;

      if (image.dataUrl) {
        const response = await fetch(image.dataUrl);
        blob = await response.blob();
      } else if (image.webPath) {
        const response = await fetch(image.webPath);
        blob = await response.blob();
      }

      if (!blob) {
        throw new Error("Camera did not return a usable photo.");
      }

      const fileName = `on-point-${Date.now()}.${image.format || "jpg"}`;
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
        lastModified: Date.now(),
      });

      addFiles([file]);

      setMediaProgress(createLocalMediaId(file), {
        name: file.name || "Inspection photo",
        type: "photo",
        stage: isOnline()
          ? "Photo added. Ready to upload"
          : "Photo added locally. Save finding offline to queue it",
        progress: isOnline() ? 15 : 100,
        status: isOnline() ? "pending" : "queued",
      });
      setMessage(
        photoType === "reference_photo"
          ? "Reference photo added and saved to your phone gallery."
          : "Photo added and saved to your phone gallery.",
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not take native photo.");
    } finally {
      setTakingNativePhoto(false);
    }
  }

  async function analyzeEquipmentWithAI() {
    if (
      analyzingEquipment ||
      analyzingPhoto ||
      generating ||
      saving ||
      savingEquipment
    )
      return;

    if (!selectedReport) {
      setMessage("Select a report before analyzing equipment.");
      return;
    }

    if (!online) {
      setMessage(
        "Equipment AI needs internet. Save photos offline, then analyze equipment when service returns.",
      );
      return;
    }

    if (photoType === "reference_photo") {
      setMessage("Switch to Finding / Defect mode before analyzing equipment.");
      return;
    }

    const images = getImagesForAi();

    if (!images.length) {
      setMessage(
        "Add or take at least one equipment photo before using Analyze Equipment.",
      );
      return;
    }

    setAnalyzingEquipment(true);
    setEquipmentResult(null);
    setMessage("");

    try {
      setMessage("Preparing equipment photo for AI...");

      const aiImages = await Promise.all(
        images.map((image) => compressImageForAiUpload(image)),
      );

      const formData = new FormData();
      aiImages.forEach((image) => {
        formData.append("images", image);
      });
      // Backward compatibility for older equipment analyzer routes.
      formData.append("image", aiImages[0]);
      formData.append("inspectionId", selectedReport || "");
      formData.append("inspection_id", selectedReport || "");

      if (note.trim()) {
        formData.append("note", note.trim());
        formData.append("inspectorNote", note.trim());
        formData.append("inspector_note", note.trim());
      }

      const res = await fetch("/api/analyze-equipment", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.error) {
        setMessage(data.error || "Equipment analysis failed.");
        return;
      }

      setEquipmentResult(data);
      setEquipmentSaveLabel(
        shouldCreateEquipmentFinding(data)
          ? "Save Equipment + Create Finding"
          : "Save To Equipment Inventory",
      );

      addAiSuggestion({
        source: "equipment",
        title: `${cleanEquipmentValue(data.manufacturer) || "Equipment"} ${
          cleanEquipmentValue(data.equipmentType) || "Analyzed"
        }`.trim(),
        section: data.section || "Heating",
        severity: shouldCreateEquipmentFinding(data)
          ? data.severity || "Monitor"
          : "Informational",
        confidence: Number(data.confidenceScore || data.confidence || 86),
        summary:
          data.clientSummary ||
          data.observation ||
          "Equipment was analyzed and added to the AI review queue.",
        reasoning: [
          cleanEquipmentValue(data.manufacturer)
            ? "Manufacturer was identified."
            : "Manufacturer should be verified.",
          cleanEquipmentValue(data.model)
            ? "Model information was identified."
            : "Model should be verified.",
          cleanEquipmentValue(data.manufactureYear)
            ? "Manufacture year was estimated or decoded."
            : "",
          shouldCreateEquipmentFinding(data)
            ? "AI found a potentially reportable equipment condition."
            : "AI considers this equipment inventory-only unless the inspector chooses otherwise.",
        ].filter(Boolean),
        recommendation: shouldCreateEquipmentFinding(data)
          ? "Review and save as Equipment + Finding if the condition is confirmed."
          : "Save to Equipment Inventory if the data is correct.",
      });

      setMessage(
        shouldCreateEquipmentFinding(data)
          ? `Equipment analyzed using ${images.length} photo${images.length === 1 ? "" : "s"}. It will save to Equipment Inventory and create a finding because the analyzer found a reportable condition.`
          : `Equipment analyzed using ${images.length} photo${images.length === 1 ? "" : "s"}. This appears informational and will save to Equipment Inventory only.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Equipment analysis failed.");
    } finally {
      setAnalyzingEquipment(false);
    }
  }

  async function saveEquipmentFromFieldTool(overrides?: {
    photos?: File[];
    equipmentResult?: EquipmentResult;
  }) {
    const er = overrides?.equipmentResult ?? equipmentResult;
    const effectivePhotos = overrides?.photos ?? photos;

    if (!er || savingEquipment || analyzingEquipment || saving) return;

    if (!selectedReport) {
      setMessage("Select a report before saving equipment.");
      return;
    }

    if (!isOnline()) {
      setMessage(
        "Equipment inventory saving needs internet right now. Save the media offline, then add equipment when service returns.",
      );
      return;
    }

    setSavingEquipment(true);
    setEquipmentSaveLabel(
      shouldCreateEquipmentFinding(er)
        ? "Preparing Equipment + Finding..."
        : "Preparing Equipment Save...",
    );
    setMessage("");

    try {
      const uploadedPhotos: UploadedPhoto[] = [];

      for (const photo of effectivePhotos) {
        uploadedPhotos.push(await uploadPhotoFile(photo, "equipment-media"));
      }

      const mainImage = uploadedPhotos.find((photo) =>
        String(photo.filePath || "").match(/\.(jpg|jpeg|png|webp|gif|heic)$/i),
      );

      setEquipmentSaveLabel("Saving Equipment Inventory...");

      const baseInventoryPayload = {
        inspection_id: Number(selectedReport),
        equipment_type: cleanEquipmentValue(er.equipmentType),
        manufacturer: cleanEquipmentValue(er.manufacturer),
        model: cleanEquipmentValue(er.model),
        serial: cleanEquipmentValue(er.serial),
        manufacture_year: cleanEquipmentValue(
          er.manufactureYear,
        ),
        estimated_age: cleanEquipmentValue(er.estimatedAge),
        expected_service_life: cleanEquipmentValue(
          er.expectedServiceLife,
        ),
        estimated_life_remaining: "",
        refrigerant: cleanEquipmentValue(er.refrigerant),
        condition: meaningfulEquipmentValue(
          cleanServiceLifeCondition(er.condition),
        ),
        inspector_note: getAiInspectorNote(er, note),
        maintenance_note: getAiMaintenanceNote(er),
        equipment_status: getEquipmentStatusLabel(er),
        image_url: mainImage?.publicUrl || "",
        file_path: mainImage?.filePath || "",
      };

      const enhancedInventoryPayload = {
        ...baseInventoryPayload,
        maintenance_schedule:
          cleanEquipmentValue(er.maintenanceSchedule) || null,
        recall_awareness:
          cleanEquipmentValue(er.recallAwareness) || null,
        known_failure_patterns: Array.isArray(
          er.knownFailurePatterns,
        )
          ? er.knownFailurePatterns
          : [],
        replacement_cost_estimate:
          cleanEquipmentValue(er.replacementCostEstimate) || null,
        life_expectancy_percent:
          Number(er.lifeExpectancyPercent) || null,
      };

      const { error: enhancedInventoryError } = await supabase
        .from("equipment_inventory")
        .insert(enhancedInventoryPayload);

      if (enhancedInventoryError) {
        const { error: fallbackInventoryError } = await supabase
          .from("equipment_inventory")
          .insert(baseInventoryPayload);

        if (fallbackInventoryError) throw fallbackInventoryError;
      }

      const createFinding = shouldCreateEquipmentFinding(er);

      if (!createFinding) {
        resetForm();
        setMessage(
          "Equipment saved to Equipment Inventory. It was not added as a defect.",
        );
        return;
      }

      let equipmentTitle =
        `${cleanEquipmentValue(er.manufacturer) || "Equipment"} ${
          cleanEquipmentValue(er.equipmentType) || "Finding"
        }`.trim();

      const titlePrefix = getFindingTitlePrefix(er);

      if (
        titlePrefix &&
        !equipmentTitle.toLowerCase().startsWith(titlePrefix.toLowerCase())
      ) {
        equipmentTitle = `${titlePrefix} – ${equipmentTitle}`;
      }

      const observationText = getCalmFindingObservation(er);
      const implicationText = getCalmFindingImplication(er);
      const recommendationText = getCalmFindingRecommendation(er);
      const findingSeverity =
        titlePrefix === "Older Equipment"
          ? "Monitor"
          : er.severity || "Informational";

      setEquipmentSaveLabel("Creating Finding...");

      const { data: findingData, error: findingError } = await supabase
        .from("findings")
        .insert({
          inspection_id: selectedReport,
          section: er.section || "Heating",
          severity: findingSeverity,
          title: equipmentTitle,
          observation: observationText,
          implication: implicationText,
          recommendation: recommendationText,
          image_url: mainImage?.publicUrl || null,
        })
        .select()
        .single();

      if (findingError) throw findingError;

      if (uploadedPhotos.length > 0 && findingData) {
        setEquipmentSaveLabel("Attaching Media...");

        const photoRows = uploadedPhotos.map((photo) => ({
          inspection_id: selectedReport,
          finding_id: findingData.id,
          public_url: photo.publicUrl,
          file_path: photo.filePath,
          is_video: Boolean(photo.isVideo),
          mime_type: photo.mimeType || (photo.isVideo ? "video/mp4" : null),
          thumbnail_url: photo.thumbnailUrl || null,
          thumbnail_path: photo.thumbnailPath || null,
        }));

        const { error: photoError } = await supabase
          .from("photos")
          .insert(photoRows);
        if (photoError) throw photoError;
      }

      resetForm();
      setMessage(
        "Equipment saved to Equipment Inventory and a report finding was created.",
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to save equipment.");
    } finally {
      setSavingEquipment(false);
      setEquipmentSaveLabel(
        er && shouldCreateEquipmentFinding(er)
          ? "Save Equipment + Create Finding"
          : "Save To Equipment Inventory",
      );
      setOnline(isOnline());
    }
  }

  async function generateFindingFromNoteText(
    noteText: string,
    successMessage = "AI finding generated. Review it before saving.",
  ) {
    const cleanNote = noteText.trim();

    if (!online) {
      setMessage(
        "AI needs internet. Save your notes/photos offline, then run AI when service returns.",
      );
      return;
    }

    if (!cleanNote) {
      setMessage("Enter or dictate a quick inspector note first.");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      const selectedInspection = reports.find(
        (report: any) => String(report.id) === String(selectedReport),
      );

      const writerImages = await Promise.all(
        getImagesForAi()
          .slice(0, 3)
          .map(async (image) => fileToDataUrl(await compressImageForAiUpload(image))),
      );

      const equipmentContext = equipmentResult
        ? [
            equipmentResult.equipmentType,
            equipmentResult.manufacturer,
            equipmentResult.model,
            equipmentResult.manufactureYear,
            equipmentResult.condition,
          ]
            .filter(Boolean)
            .join(" | ")
        : "";

      const res = await fetch("/api/ai-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: cleanNote,
          inspectionId: selectedReport || "",
          inspection_id: selectedReport || "",
          title,
          observation,
          implication,
          recommendation,
          section,
          severity,
          propertyYear:
            selectedInspection?.year_built ||
            selectedInspection?.yearBuilt ||
            "",
          equipmentContext,
          images: writerImages,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "AI failed");
        return;
      }

      setPhotoType("finding");
      setTitle(data.title || "");
      setObservation(data.observation || "");
      setImplication(data.implication || "");
      setRecommendation(data.recommendation || "");
      setSection(SECTIONS.includes(data.section) ? data.section : "Exterior");
      setSeverity(
        SEVERITIES.includes(data.severity)
          ? data.severity
          : "Recommended Repair",
      );

      addAiSuggestion({
        source: successMessage.toLowerCase().includes("voice")
          ? "voice"
          : "note",
        title: data.title || "Generated Finding",
        section: data.section || section,
        severity: data.severity || severity,
        confidence: Number(data.confidence || data.confidenceScore || 82),
        summary:
          data.observation || "AI generated a finding from the inspector note.",
        reasoning: [
          "Inspector note was used as the primary source of truth.",
          data.section ? `AI selected ${data.section}.` : "",
          data.severity ? `AI selected ${data.severity}.` : "",
          data.maintenanceTip ? `Maintenance: ${data.maintenanceTip}` : "",
          data.liabilityNote ? `Verification note: ${data.liabilityNote}` : "",
          ...(Array.isArray(data.evidence) ? data.evidence.slice(0, 3) : []),
        ].filter(Boolean),
        recommendation: data.recommendation || "Review and edit before saving.",
      });

      setMessage(successMessage);
    } catch (error: any) {
      setMessage(error?.message || "AI failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateWithAI() {
    await generateFindingFromNoteText(note);
  }

  function clearVoiceTimeout() {
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
  }

  function finishVoiceDictation() {
    clearVoiceTimeout();
    voiceRecognitionRef.current = null;
    setDictating(false);
  }

  async function finishDictationAndGenerate(transcriptValue?: string) {
    const transcript = String(
      transcriptValue || voiceTranscriptRef.current || note || "",
    ).trim();

    finishVoiceDictation();
    voiceTranscriptRef.current = "";
    voiceStopRequestedRef.current = false;

    if (!transcript) {
      setMessage(
        "No voice note was captured. Try again or type the note manually.",
      );
      return;
    }

    setNote(transcript);
    setMessage("Voice note captured. Generating finding...");
    await generateFindingFromNoteText(
      transcript,
      "Voice finding generated. Review and edit it before saving.",
    );
  }

  async function startBrowserDictation() {
    if (typeof window === "undefined") return;

    const BrowserSpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!BrowserSpeechRecognition) {
      setMessage(
        "Voice dictation is not supported in this browser. Use your keyboard microphone to dictate into the Quick Inspector Note, then tap Generate From Note.",
      );
      return;
    }

    const recognition = new BrowserSpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    voiceRecognitionRef.current = recognition;
    voiceTranscriptRef.current = "";
    voiceStopRequestedRef.current = false;

    setDictating(true);
    setPhotoType("finding");
    setMessage(
      "Listening... describe the finding. Tap Stop Listening when you are done.",
    );

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (transcript) {
        voiceTranscriptRef.current = transcript;
        setNote(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      const errorName = event?.error || "unknown";

      finishVoiceDictation();
      voiceTranscriptRef.current = "";
      voiceStopRequestedRef.current = false;

      if (errorName === "no-speech") {
        setMessage(
          "No voice was detected. Try again, speak a little louder, or use your keyboard microphone in the Quick Inspector Note field.",
        );
        return;
      }

      if (errorName === "not-allowed" || errorName === "service-not-allowed") {
        setMessage(
          "Microphone access was blocked. Allow microphone access for this site/app, then try Dictate Finding again.",
        );
        return;
      }

      setMessage(`Voice dictation failed: ${errorName}`);
    };

    recognition.onend = () => {
      const transcript = String(voiceTranscriptRef.current || "").trim();

      if (voiceStopRequestedRef.current || transcript) {
        void finishDictationAndGenerate(transcript);
        return;
      }

      finishVoiceDictation();
      voiceTranscriptRef.current = "";
      voiceStopRequestedRef.current = false;
      setMessage(
        "No voice note was captured. Try again or type the note manually.",
      );
    };

    try {
      recognition.start();
    } catch (error: any) {
      finishVoiceDictation();
      voiceTranscriptRef.current = "";
      voiceStopRequestedRef.current = false;
      setMessage(error?.message || "Voice dictation could not start.");
    }
  }

  async function startNativeDictation() {
    try {
      voiceTranscriptRef.current = "";
      voiceStopRequestedRef.current = false;
      voiceRecognitionRef.current = null;

      setDictating(true);
      setPhotoType("finding");
      setMessage("Requesting microphone and speech recognition permission...");

      const platform = (() => {
        try {
          return Capacitor.getPlatform();
        } catch {
          return (window as any)?.Capacitor?.getPlatform?.() || "unknown";
        }
      })();

      if (!isNativeCapacitorApp()) {
        finishVoiceDictation();
        setMessage(
          `Native speech was not started because this app is being detected as "${platform}" instead of iOS. This means the Capacitor native bridge is not available on this screen.`,
        );
        return;
      }

      const permission = await NativeSpeechRecognition.requestPermissions();
      const permissionAny = permission as any;
      const speechGranted =
        permissionAny?.speechRecognition === "granted" ||
        permissionAny?.speechRecognition === "prompt" ||
        permissionAny?.speechRecognition === undefined;
      const microphoneGranted =
        permissionAny?.microphone === "granted" ||
        permissionAny?.microphone === "prompt" ||
        permissionAny?.microphone === undefined;

      if (!speechGranted || !microphoneGranted) {
        finishVoiceDictation();
        setMessage(
          `Speech or microphone permission was not granted. Current permission response: ${JSON.stringify(permissionAny)}`,
        );
        return;
      }

      setMessage("Checking native speech recognition availability...");

      const available = await NativeSpeechRecognition.available();
      if (!available?.available) {
        finishVoiceDictation();
        setMessage(
          "Native speech recognition is not available on this device. Make sure Siri & Dictation are enabled in iPhone Settings, then try again.",
        );
        return;
      }

      await NativeSpeechRecognition.removeAllListeners();

      await NativeSpeechRecognition.addListener(
        "partialResults",
        (data: any) => {
          const transcript = (data?.matches || [])
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

          if (transcript) {
            voiceTranscriptRef.current = transcript;
            setNote(transcript);
          }
        },
      );

      await NativeSpeechRecognition.addListener(
        "listeningState",
        (data: any) => {
          if (data?.status === "started") {
            setMessage(
              "Listening... describe the finding. Tap Stop Listening when you are done.",
            );
          }

          if (data?.status === "stopped" && !voiceStopRequestedRef.current) {
            const transcript = String(voiceTranscriptRef.current || "").trim();
            if (transcript) {
              void finishDictationAndGenerate(transcript);
            } else {
              finishVoiceDictation();
              setMessage(
                "Listening stopped, but no voice note was captured. Try again or type the note manually.",
              );
            }
          }
        },
      );

      const result = await NativeSpeechRecognition.start({
        language: "en-US",
        maxResults: 1,
        partialResults: true,
        popup: false,
      });

      const immediateTranscript = (result?.matches || [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (immediateTranscript) {
        voiceTranscriptRef.current = immediateTranscript;
        setNote(immediateTranscript);
      }

      setMessage(
        "Listening... describe the finding. Tap Stop Listening when you are done.",
      );
    } catch (error: any) {
      try {
        await NativeSpeechRecognition.stop();
      } catch {
        // Ignore stop errors.
      }

      await NativeSpeechRecognition.removeAllListeners().catch(() => undefined);
      finishVoiceDictation();
      voiceTranscriptRef.current = "";
      voiceStopRequestedRef.current = false;
      setMessage(
        error?.message ||
          error?.errorMessage ||
          JSON.stringify(error) ||
          "Native voice dictation could not start.",
      );
    }
  }

  async function stopNativeDictation() {
    voiceStopRequestedRef.current = true;
    setMessage("Stopping recording...");

    try {
      await NativeSpeechRecognition.stop();
    } catch {
      // Ignore stop errors from native speech recognition.
    }

    await NativeSpeechRecognition.removeAllListeners().catch(() => undefined);
    await finishDictationAndGenerate(voiceTranscriptRef.current);
  }

  async function dictateFinding() {
    if (dictating) {
      if (nativeApp) {
        await stopNativeDictation();
        return;
      }

      voiceStopRequestedRef.current = true;
      setMessage("Stopping recording...");

      const transcript = String(
        voiceTranscriptRef.current || note || "",
      ).trim();

      try {
        voiceRecognitionRef.current?.stop?.();
      } catch {
        // Ignore stop errors from browser speech recognition.
      }

      window.setTimeout(() => {
        if (!dictating) return;
        void finishDictationAndGenerate(transcript);
      }, 700);

      return;
    }

    if (
      generating ||
      analyzingPhoto ||
      analyzingEquipment ||
      saving ||
      savingEquipment
    )
      return;

    if (photoType === "reference_photo") {
      setMessage("Switch to Finding / Defect mode before dictating a finding.");
      return;
    }

    if (!online) {
      setMessage(
        "Voice dictation can start now. AI generation will still need internet after the note is captured.",
      );
    }

    if (nativeApp) {
      await startNativeDictation();
      return;
    }

    await startBrowserDictation();
  }

  async function organizeSelectedPhotosWithAI() {
    if (organizingMedia || savingOrganizedMedia) return;

    const imageEntries = photos
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => file.type.startsWith("image/"))
      .slice(0, 12);

    if (imageEntries.length < 2) {
      setMessage("Add at least two photos to use AI media organization.");
      return;
    }

    if (!online) {
      setMessage("AI media organization requires internet.");
      return;
    }

    setOrganizingMedia(true);
    setMessage("AI is organizing the selected photos...");

    try {
      const images = await Promise.all(
        imageEntries.map(async ({ file, index }) => {
          const prepared = await compressImageForAiUpload(file);
          return {
            originalIndex: index,
            name: file.name,
            dataUrl: await fileToDataUrl(prepared),
          };
        }),
      );

      const response = await fetch("/api/ai/media-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          currentSection: section,
          images,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "AI could not organize the photos.");
      }

      const mappedGroups: AIMediaGroup[] = (data.groups || []).map(
        (group: AIMediaGroup) => ({
          ...group,
          photoIndexes: (group.photoIndexes || [])
            .map((aiIndex) => images[aiIndex]?.originalIndex)
            .filter((value) => Number.isInteger(value)),
        }),
      );

      setMediaGroups(mappedGroups);
      setMediaOrganizerOpen(true);
      setMessage(
        `AI organized ${imageEntries.length} photos into ${mappedGroups.length} group${mappedGroups.length === 1 ? "" : "s"}. Review before saving.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "AI media organization failed.");
    } finally {
      setOrganizingMedia(false);
    }
  }

  function updateMediaGroup(
    groupId: string,
    patch: Partial<AIMediaGroup>,
  ) {
    setMediaGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    );
  }

  async function saveOrganizedMediaGroups() {
    if (savingOrganizedMedia || organizingMedia) return;

    const approvedGroups = mediaGroups.filter(
      (group) =>
        group.classification === "finding" &&
        group.photoIndexes.length > 0,
    );

    if (!approvedGroups.length) {
      setMessage(
        "No finding groups are ready. Change at least one group to Finding.",
      );
      return;
    }

    setSavingOrganizedMedia(true);
    setMessage("Saving AI-organized findings...");

    try {
      let savedCount = 0;

      for (const group of approvedGroups) {
        const groupFiles = group.photoIndexes
          .map((index) => photos[index])
          .filter(Boolean);

        const uploaded: UploadedPhoto[] = [];
        for (const file of groupFiles) {
          uploaded.push(await uploadPhotoFile(file, "field-media"));
        }

        const { data: finding, error } = await supabase
          .from("findings")
          .insert({
            inspection_id: selectedReport,
            title: group.title || group.label || "Inspection Finding",
            section: group.section,
            severity: group.severity,
            observation: group.observation,
            implication: group.implication,
            recommendation: group.recommendation,
            image_url:
              uploaded.find((item) => !item.isVideo)?.publicUrl || null,
          })
          .select()
          .single();

        if (error) throw error;

        if (uploaded.length) {
          const { error: photoError } = await supabase.from("photos").insert(
            uploaded.map((item) => ({
              inspection_id: selectedReport,
              finding_id: finding.id,
              public_url: item.publicUrl,
              file_path: item.filePath,
              is_video: Boolean(item.isVideo),
              mime_type: item.mimeType || null,
              thumbnail_url: item.thumbnailUrl || null,
              thumbnail_path: item.thumbnailPath || null,
            })),
          );

          if (photoError) throw photoError;
        }

        savedCount += 1;
      }

      const usedIndexes = new Set(
        approvedGroups.flatMap((group) => group.photoIndexes),
      );
      setPhotos((current) =>
        current.filter((_file, index) => !usedIndexes.has(index)),
      );
      setMediaGroups([]);
      setMediaOrganizerOpen(false);
      setMessage(
        `${savedCount} AI-organized finding${savedCount === 1 ? "" : "s"} saved.`,
      );

      window.dispatchEvent(
        new CustomEvent("opi:inspection-data-changed", {
          detail: {
            inspectionId: selectedReport,
            source: "ai-media-organizer",
          },
        }),
      );
    } catch (error: any) {
      setMessage(
        error?.message || "Could not save the AI-organized findings.",
      );
    } finally {
      setSavingOrganizedMedia(false);
      clearCompletedProgressSoon();
    }
  }

  async function uploadPhotoFile(
    photo: File,
    folder: string,
  ): Promise<UploadedPhoto> {
    const isVideo = photo.type.startsWith("video/");
    const progressId = createLocalMediaId(photo);
    const progressType: UploadProgressItem["type"] = isVideo ? "video" : "photo";

    let uploadFile = photo;
    let thumbnailFile: File | null = null;

    setMediaProgress(progressId, {
      name: photo.name || (isVideo ? "Inspection video" : "Inspection photo"),
      type: progressType,
      stage: isVideo ? "Preparing video backup" : "Optimizing photo",
      progress: 8,
      status: "processing",
    });

    if (isVideo) {
      setMessage("Preparing video for report...");
      setMediaProgress(progressId, {
        name: photo.name || "Inspection video",
        type: progressType,
        stage: "Converting video for browser playback",
        progress: 18,
        status: "processing",
      });

      try {
        const formData = new FormData();
        formData.append("video", photo);

        const response = await fetch("/api/video-convert", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(errorText || "Video conversion failed");
        }

        const convertedBlob = await response.blob();
        if (!convertedBlob || convertedBlob.size === 0) {
          throw new Error("Video conversion returned an empty MP4.");
        }

        uploadFile = new File([convertedBlob], `video-${Date.now()}.mp4`, {
          type: "video/mp4",
          lastModified: Date.now(),
        });
      } catch (error) {
        console.warn("Video conversion failed. Saving original video instead.", error);
        uploadFile = photo;
      }

      setMediaProgress(progressId, {
        name: photo.name || "Inspection video",
        type: progressType,
        stage: "Creating video thumbnail",
        progress: 48,
        status: "processing",
      });

      thumbnailFile = await createVideoThumbnailForUpload(uploadFile);
      if (!thumbnailFile && uploadFile !== photo) {
        thumbnailFile = await createVideoThumbnailForUpload(photo);
      }
    } else {
      // Permanent, pre-generated variants are the key to instant report loading.
      // The report card downloads the tiny thumbnail instead of resizing a multi-MB
      // phone photo on every page view.
      setMediaProgress(progressId, {
        name: photo.name || "Inspection photo",
        type: progressType,
        stage: "Creating report image + instant thumbnail",
        progress: 20,
        status: "processing",
      });

      [uploadFile, thumbnailFile] = await Promise.all([
        createFullImageForUpload(photo),
        createThumbnailForUpload(photo),
      ]);
    }

    const safeName = uploadFile.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .slice(0, 60);
    const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const fileExtension = isVideo
      ? String(uploadFile.name.split(".").pop() || "mp4").toLowerCase()
      : "jpg";
    const fileName = `${selectedReport}/${folder}/${baseName}.${fileExtension}`;
    const generatedThumbnailPath = thumbnailFile
      ? `${selectedReport}/${folder}/thumbnails/${baseName}-thumb.jpg`
      : null;

    setMediaProgress(progressId, {
      name: uploadFile.name || photo.name || "Inspection media",
      type: progressType,
      stage: isVideo ? "Uploading video + thumbnail" : "Uploading photo + instant thumbnail",
      progress: isVideo ? 62 : 55,
      status: "uploading",
    });

    const fullUploadPromise = supabase.storage
      .from("inspection-photos")
      .upload(fileName, uploadFile, {
        cacheControl: "31536000",
        upsert: false,
        contentType: uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
      });

    const thumbnailUploadPromise = generatedThumbnailPath && thumbnailFile
      ? supabase.storage
          .from("inspection-photos")
          .upload(generatedThumbnailPath, thumbnailFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: "image/jpeg",
          })
      : Promise.resolve({ error: null } as any);

    const [fullUpload, thumbnailUpload] = await Promise.all([
      fullUploadPromise,
      thumbnailUploadPromise,
    ]);

    if (fullUpload.error) {
      setMediaProgress(progressId, {
        name: uploadFile.name || photo.name || "Inspection media",
        type: progressType,
        stage: "Upload failed. Item can be saved to local queue",
        progress: 0,
        status: "error",
      });
      throw fullUpload.error;
    }

    const { data: fullPublicData } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    let thumbnailPath: string | null = generatedThumbnailPath;
    let thumbnailUrl: string | null = null;

    if (thumbnailUpload.error) {
      console.warn("Thumbnail upload failed; full photo was preserved.", thumbnailUpload.error);
      thumbnailPath = null;
    } else if (thumbnailPath) {
      const { data: thumbnailPublicData } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(thumbnailPath);
      thumbnailUrl = thumbnailPublicData.publicUrl;
    }

    setMediaProgress(progressId, {
      name: uploadFile.name || photo.name || "Inspection media",
      type: progressType,
      stage: thumbnailUrl ? "Instant preview ready" : "Media uploaded",
      progress: 100,
      status: "done",
    });

    return {
      publicUrl: fullPublicData.publicUrl,
      filePath: fileName,
      isVideo,
      mimeType: isVideo ? uploadFile.type || "video/mp4" : "image/jpeg",
      thumbnailUrl,
      thumbnailPath,
    };
  }

  async function saveReferencePhotosOnline() {
    if (photos.length === 0) {
      throw new Error("Add at least one photo for a section reference photo.");
    }

    const imagePhotos = photos.filter((photo) =>
      photo.type.startsWith("image/"),
    );

    if (imagePhotos.length !== photos.length) {
      throw new Error(
        "Reference photos must be images. Videos can be saved as finding media while online.",
      );
    }

    let saved = 0;

    for (const photo of imagePhotos) {
      const uploaded = await uploadPhotoFile(
        photo,
        `reference-photos/${safeSectionFolder(section)}`,
      );

      const { error } = await supabase.from("section_reference_photos").insert({
        inspection_id: selectedReport,
        section,
        caption: note.trim() || title.trim() || null,
        file_path: uploaded.filePath,
        public_url: uploaded.publicUrl,
        thumbnail_path: uploaded.thumbnailPath || null,
        thumbnail_url: uploaded.thumbnailUrl || null,
      });

      if (error) throw error;
      saved += 1;
    }

    return saved;
  }

  async function saveMediaToExistingFindingOnline() {
    if (!existingFindingId) {
      throw new Error("Select the existing finding that should receive this media.");
    }

    if (photos.length === 0) {
      throw new Error("Add at least one photo or video.");
    }

    const selectedFinding = existingFindings.find(
      (finding) => String(finding.id) === String(existingFindingId),
    );
    if (!selectedFinding) throw new Error("The selected finding could not be found.");

    const uploadedMedia: UploadedPhoto[] = [];
    for (const media of photos) {
      uploadedMedia.push(await uploadPhotoFile(media, "field-media"));
    }

    const photoRows = uploadedMedia.map((media) => ({
      inspection_id: selectedReport,
      finding_id: existingFindingId,
      public_url: media.publicUrl,
      file_path: media.filePath,
      is_video: Boolean(media.isVideo),
      mime_type: media.mimeType || (media.isVideo ? "video/mp4" : null),
      thumbnail_url: media.thumbnailUrl || null,
      thumbnail_path: media.thumbnailPath || null,
    }));

    const { error: photoError } = await supabase.from("photos").insert(photoRows);
    if (photoError) throw photoError;

    const firstImage = uploadedMedia.find((media) => !media.isVideo);
    if (!selectedFinding.image_url && firstImage?.publicUrl) {
      const { error: updateError } = await supabase
        .from("findings")
        .update({ image_url: firstImage.publicUrl })
        .eq("id", existingFindingId)
        .eq("inspection_id", selectedReport);
      if (updateError) throw updateError;
    }

    return { finding: selectedFinding, count: uploadedMedia.length };
  }

  async function saveFindingOnline(overrides?: {
    photos?: File[];
    title?: string;
    note?: string;
    section?: string;
    severity?: string;
    observation?: string;
    implication?: string;
    recommendation?: string;
  }) {
    const effectivePhotos = overrides?.photos ?? photos;
    const effectiveTitle = overrides?.title ?? title;
    const effectiveNote = overrides?.note ?? note;
    const effectiveSection = overrides?.section ?? section;
    const effectiveSeverity = overrides?.severity ?? severity;
    const effectiveObservation = overrides?.observation ?? observation;
    const effectiveImplication = overrides?.implication ?? implication;
    const effectiveRecommendation = overrides?.recommendation ?? recommendation;

    const uploadedPhotos: UploadedPhoto[] = [];

    for (const photo of effectivePhotos) {
      uploadedPhotos.push(await uploadPhotoFile(photo, "field-media"));
    }

    const fallbackTitle =
      effectiveTitle.trim() || effectiveNote.trim().slice(0, 80) || "Field Finding";
    const fallbackObservation =
      effectiveObservation.trim() ||
      (effectiveNote.trim() ? `Inspector field note: ${effectiveNote.trim()}` : "");

    const { data: finding, error } = await supabase
      .from("findings")
      .insert({
        inspection_id: selectedReport,
        title: fallbackTitle,
        section: effectiveSection,
        severity: effectiveSeverity,
        observation: fallbackObservation,
        implication: effectiveImplication,
        recommendation: effectiveRecommendation,
        image_url:
          uploadedPhotos.find((photo) =>
            String(photo.filePath || "").match(
              /\.(jpg|jpeg|png|webp|gif|heic)$/i,
            ),
          )?.publicUrl || null,
      })
      .select()
      .single();

    if (error) throw error;

    if (uploadedPhotos.length > 0) {
      const photoRows = uploadedPhotos.map((photo) => ({
        inspection_id: selectedReport,
        finding_id: finding.id,
        public_url: photo.publicUrl,
        file_path: photo.filePath,
        is_video: Boolean(photo.isVideo),
        mime_type: photo.mimeType || (photo.isVideo ? "video/mp4" : null),
        thumbnail_url: photo.thumbnailUrl || null,
        thumbnail_path: photo.thumbnailPath || null,
      }));

      const { error: photoError } = await supabase
        .from("photos")
        .insert(photoRows);
      if (photoError) throw photoError;
    }

    return finding;
  }

  async function saveLimitationWithPhotoOnline(overrides?: {
    photos?: File[];
    title?: string;
    note?: string;
    section?: string;
    recommendation?: string;
  }) {
    const effectivePhotos = overrides?.photos ?? photos;
    const effectiveSection = overrides?.section ?? section;
    const effectiveRecommendation = overrides?.recommendation ?? recommendation;
    const limitationText = String(overrides?.note ?? note ?? "").trim();
    const limitationTitle =
      String(overrides?.title ?? title ?? "").trim() || "Field Limitation";
    const image = effectivePhotos.find((photo) => photo.type.startsWith("image/"));

    if (!limitationText) {
      throw new Error("Enter the limitation wording before saving.");
    }

    if (!image) {
      throw new Error("Add one photo showing why the area or component was limited.");
    }

    const imageDataUrl = await fileToDataUrl(image);

    const response = await fetch("/api/ai/live-limitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        inspectionId: String(selectedReport),
        section: effectiveSection,
        title: limitationTitle,
        limitation: limitationText,
        reason: "",
        recommendation: effectiveRecommendation.trim(),
        imageDataUrl,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error ||
          data?.photoError ||
          "The limitation and photo could not be saved.",
      );
    }

    window.dispatchEvent(
      new CustomEvent("opi:section-limitations-changed", {
        detail: {
          inspectionId: selectedReport,
          section: effectiveSection,
          limitationId: data.limitation?.id || data.limitationId || null,
          photoId: data.photo?.id || data.photoId || null,
        },
      }),
    );

    window.dispatchEvent(
      new CustomEvent("opi:inspection-data-changed", {
        detail: {
          inspectionId: selectedReport,
          section: effectiveSection,
          source: "field-limitation-photo",
        },
      }),
    );

    return data;
  }

  async function saveFieldItem() {
    if (!selectedReport) {
      setMessage("Select a report first.");
      return;
    }

    if (
      photoType === "finding" &&
      !title.trim() &&
      !note.trim() &&
      !observation.trim() &&
      photos.length === 0
    ) {
      setMessage(
        "Add a title, observation, inspector note, or media before saving.",
      );
      return;
    }

    if (photoType === "reference_photo" && photos.length === 0) {
      setMessage("Add at least one photo before saving a reference photo.");
      return;
    }

    if (
      photoType === "limitation" &&
      (!note.trim() ||
        !photos.some((photo) => photo.type.startsWith("image/")))
    ) {
      setMessage(
        "Enter the limitation wording and add one photo showing the limitation.",
      );
      return;
    }

    if (photoType === "existing_finding" && !existingFindingId) {
      setMessage("Select an existing finding first.");
      return;
    }

    if (photoType === "existing_finding" && photos.length === 0) {
      setMessage("Add at least one photo or video to attach.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (!isOnline()) {
        if (photoType === "existing_finding") {
          setMessage(
            "Adding media to an existing finding requires a connection. Your selected media remains here so you can retry when service returns.",
          );
          return;
        }

        if (photoType === "limitation") {
          setMessage(
            "Saving a limitation with its photo currently requires a connection. Your wording and selected photo remain here so you can retry.",
          );
          return;
        }

        setMessage("Saving offline locally...");

        const { offlinePhotos, skippedCount, skippedVideos } =
          await prepareOfflinePhotosForQueue(photos);

        if (photoType === "reference_photo" && offlinePhotos.length === 0) {
          setMessage(
            "Reference photos need at least one image small enough for offline storage. Large videos/files stay on your phone and can be attached when service returns.",
          );
          return;
        }

        addOfflineQueueItem({
          type: photoType === "reference_photo" ? "reference_photo" : "finding",
          payload: {
            inspection_id: selectedReport,
            title,
            section,
            severity,
            inspector_note: note,
            note,
            caption: note || title,
            observation,
            implication,
            recommendation,
            photos: offlinePhotos,
            run_ai_after_sync: photoType === "finding",
            ai_after_sync: photoType === "finding",
            offline_media_skipped_count: skippedCount,
            offline_video_skipped_count: skippedVideos,
          },
        });

        photos.forEach((photo) => {
          const localId = createLocalMediaId(photo);
          const canStoreOffline = offlinePhotos.some(
            (offlinePhoto: any) =>
              offlinePhoto.name === photo.name &&
              Number(offlinePhoto.size || 0) === Number(photo.size || 0),
          );

          setMediaProgress(localId, {
            name: photo.name || "Inspection media",
            type: photo.type.startsWith("video/") ? "video" : "photo",
            stage: canStoreOffline
              ? "Saved locally. Will sync when signal returns"
              : "Too large for browser offline queue. Original remains on device",
            progress: 100,
            status: canStoreOffline ? "queued" : "error",
          });
        });

        resetForm();
        const summary = getOfflineQueueSummary();
        const skipMessage = getOfflineMediaSkipMessage(skippedCount, skippedVideos);

        setMessage(
          photoType === "reference_photo"
            ? `Saved reference photo offline. Queue: ${summary.count} item(s). It will sync when service returns.${skipMessage}`
            : `Saved finding offline. Queue: ${summary.count} item(s). Background sync will retry automatically when service returns. AI will write the finding after sync.${skipMessage}`,
        );
        return;
      }

      if (photoType === "existing_finding") {
        const result = await saveMediaToExistingFindingOnline();
        const findingTitle = result.finding?.title || "existing finding";
        resetForm();
        setMessage(
          `${result.count} media item${result.count === 1 ? "" : "s"} added to “${findingTitle}”.`,
        );
        window.dispatchEvent(
          new CustomEvent("opi:inspection-data-changed", {
            detail: { inspectionId: selectedReport, source: "field-existing-finding-media" },
          }),
        );
        return;
      }

      if (photoType === "reference_photo") {
        const count = await saveReferencePhotosOnline();
        resetForm();
        setMessage(
          `${count} reference photo${count === 1 ? "" : "s"} saved to ${section}.`,
        );
        return;
      }

      if (photoType === "limitation") {
        await saveLimitationWithPhotoOnline();
        const savedSection = section;
        resetForm();
        setMessage(`Limitation and photo saved to ${savedSection}.`);
        return;
      }

      await saveFindingOnline();
      resetForm();
      setMessage("Finding saved to report.");
    } catch (error: any) {
      const shouldQueueAfterFailure =
        photoType !== "existing_finding" &&
        photoType !== "limitation" &&
        photos.length > 0 &&
        (isLikelyNetworkError(error) || !isOnline());

      if (shouldQueueAfterFailure) {
        try {
          const { offlinePhotos, skippedCount, skippedVideos } =
            await prepareOfflinePhotosForQueue(photos);

          addOfflineQueueItem({
            type: photoType === "reference_photo" ? "reference_photo" : "finding",
            payload: {
              inspection_id: selectedReport,
              title,
              section,
              severity,
              inspector_note: note,
              note,
              caption: note || title,
              observation,
              implication,
              recommendation,
              photos: offlinePhotos,
              run_ai_after_sync: photoType === "finding",
              ai_after_sync: photoType === "finding",
              offline_media_skipped_count: skippedCount,
              offline_video_skipped_count: skippedVideos,
            },
          });

          photos.forEach((photo) => {
            const canStoreOffline = offlinePhotos.some(
              (offlinePhoto: any) =>
                offlinePhoto.name === photo.name &&
                Number(offlinePhoto.size || 0) === Number(photo.size || 0),
            );

            setMediaProgress(createLocalMediaId(photo), {
              name: photo.name || "Inspection media",
              type: photo.type.startsWith("video/") ? "video" : "photo",
              stage: canStoreOffline
                ? "Saved locally. Will retry when signal returns"
                : "Too large for browser offline queue. Original remains on device",
              progress: 100,
              status: canStoreOffline ? "queued" : "error",
            });
          });

          resetForm();
          const summary = getOfflineQueueSummary();
          const skipMessage = getOfflineMediaSkipMessage(skippedCount, skippedVideos);
          setMessage(
            `Signal/upload issue detected. Saved locally instead of losing work. Queue: ${summary.count} item(s). Background sync will retry automatically when service returns. AI will write the finding after sync.${skipMessage}`,
          );
          clearCompletedProgressSoon();
          return;
        } catch (queueError: any) {
          setMessage(
            queueError?.message ||
              error?.message ||
              "Failed to save field item.",
          );
          return;
        }
      }

      setMessage(error?.message || "Failed to save field item.");
    } finally {
      setSaving(false);
      setOnline(isOnline());
    }
  }

  if (showOfflineReportViewer && selectedReport) {
    return (
      <main className="min-h-screen bg-[#020617] p-3 pb-[calc(100px+env(safe-area-inset-bottom))] text-white sm:p-6">
        <OfflineReportViewer
          inspectionId={String(selectedReport)}
          onClose={() => setShowOfflineReportViewer(false)}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0f172a] p-4 text-white">
      <div className="mx-auto grid min-w-0 max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 rounded-2xl bg-[#111827] p-5 shadow-2xl">
          <h1 className="mb-2 text-3xl font-bold text-teal-400">
            FLOW Field Workflow
          </h1>

          <p className="mb-4 text-slate-400">
            Capture findings, defect media, and section reference photos in the
            field. If service drops, items save locally and sync when you are
            back online.
          </p>

          <div className="mb-4 rounded-xl border border-slate-700 bg-black/40 p-4 text-sm text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`font-black ${online ? "text-green-300" : "text-yellow-300"}`}
              >
                {online ? "Online" : "Offline Mode"}
              </span>
              <span>
                Queue: {offlineSummary.count} item(s),{" "}
                {offlineSummary.referencePhotoCount} reference,{" "}
                {offlineSummary.findingCount} finding, about{" "}
                {offlineSummary.megabytes} MB
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Native iOS photo captures save a copy to your phone gallery when
              allowed. Videos recorded or chosen from the iPhone picker remain
              in Photos, then upload with visible progress and offline fallback
              protection.
            </p>
          </div>

          <div className="mb-6">
            <OfflineSyncStatus />
          </div>

          {syncNotice && (
            <div className="mb-5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm font-black text-emerald-200">
              {syncNotice}
            </div>
          )}

          {message && (
            <div className="mb-5 rounded-xl border border-teal-500/40 bg-teal-950/20 p-4 text-sm font-bold text-teal-200">
              {message}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="mb-2 block font-bold">Select Report</label>
              <select
                value={selectedReport}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedReport(nextId);

                  if (nextId) {
                    const selectedInspection = reports.find(
                      (report: any) => String(report.id) === String(nextId),
                    );

                    saveInspectionPreload({
                      inspectionId: nextId,
                      inspection: selectedInspection,
                      reports,
                      comments: [],
                      templates: [],
                      sections: SECTIONS,
                      findings: [],
                      clientInfo: selectedInspection || {},
                    });
                  }
                }}
                className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
              >
                <option value="">Select Report</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.property_address ||
                      report.address ||
                      "Unnamed Inspection"}
                  </option>
                ))}
              </select>

              {selectedReport && (
                <div className="mt-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-xs font-bold text-cyan-100">
                  {selectedOfflinePreload
                    ? `Offline preload ready for ${selectedOfflinePreload.inspection?.label || "this inspection"} — sections, selected report info, client info, and field workflow cache are stored on this device.`
                    : "This inspection will be cached on this device for offline use."}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black/25">
              <div className="overflow-x-auto border-b border-slate-700 bg-slate-950/80 p-1">
                <div className="grid min-w-[640px] grid-cols-4 gap-1">
                  <button
                    type="button"
                    onClick={() => setAssistantTab("live")}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black transition [touch-action:manipulation] ${
                      assistantTab === "live"
                        ? "bg-cyan-400 text-black"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    📹 Live Camera
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistantTab("coach")}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black transition [touch-action:manipulation] ${
                      assistantTab === "coach"
                        ? "bg-emerald-400 text-black"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    🧭 Section Coach
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistantTab("copilot")}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black transition [touch-action:manipulation] ${
                      assistantTab === "copilot"
                        ? "bg-indigo-400 text-black"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    ✨ AI Assistant
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistantTab("review")}
                    className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black transition [touch-action:manipulation] ${
                      assistantTab === "review"
                        ? "bg-purple-400 text-black"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    🔎 Live Review
                  </button>
                </div>
              </div>

              <div className="p-3">
                {assistantTab === "live" && (
                  <AILiveInspectionCamera
                    online={online}
                    selectedReport={selectedReport}
                    currentSection={section}
                    currentSeverity={severity}
                    onAccept={handleCameraAccept}
                  />
                )}

                {assistantTab === "coach" && (
                  <LiveSectionCoach
                    inspectionId={selectedReport}
                    section={section}
                    online={online}
                  />
                )}

                {assistantTab === "copilot" &&
                  (selectedReport ? (
                    <InspectionCopilotPanel
                      inspectionId={String(selectedReport)}
                      compact
                    />
                  ) : (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
                      Select a report to use the AI Inspector Assistant.
                    </div>
                  ))}

                {assistantTab === "review" && (
                  <AISecondInspector
                    suggestions={aiSuggestions}
                    onAccept={acceptAiSuggestion}
                    onIgnore={ignoreAiSuggestion}
                    onClear={() => setAiSuggestions([])}
                  />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-black/35 p-4">
              <label
                htmlFor="field-workflow"
                className="mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-400"
              >
                Workflow
              </label>

              <div className="relative">
                <select
                  id="field-workflow"
                  value={photoType}
                  onChange={(event) =>
                    handleWorkflowChange(event.target.value as PhotoType)
                  }
                  className={`min-h-[58px] w-full appearance-none rounded-xl border bg-slate-950 px-4 py-3 pr-12 text-base font-black outline-none transition focus:ring-2 [touch-action:manipulation] ${
                    photoType === "finding"
                      ? "border-teal-400/70 text-teal-200 focus:border-teal-300 focus:ring-teal-400/25"
                      : photoType === "existing_finding"
                        ? "border-purple-400/70 text-purple-200 focus:border-purple-300 focus:ring-purple-400/25"
                        : photoType === "reference_photo"
                          ? "border-cyan-400/70 text-cyan-200 focus:border-cyan-300 focus:ring-cyan-400/25"
                          : "border-orange-400/70 text-orange-200 focus:border-orange-300 focus:ring-orange-400/25"
                  }`}
                >
                  <option value="finding">Finding / Defect</option>
                  <option value="existing_finding">
                    Add Media to Existing Defect
                  </option>
                  <option value="reference_photo">
                    Section Reference Photo
                  </option>
                  <option value="limitation">
                    Section Limitation + Photo
                  </option>
                </select>

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl text-slate-300">
                  ▾
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {photoType === "finding"
                  ? "Creates a new report finding and can include photos or video."
                  : photoType === "existing_finding"
                    ? "Adds photos or video to an existing defect without creating a duplicate."
                    : photoType === "reference_photo"
                      ? "Saves photos to the selected section as reference media only."
                      : "Saves limitation wording and one supporting photo to the selected section."}
              </p>
            </div>

            <FieldCamera
              destinationLabel={cameraDestinationLabel}
              selectedMediaCount={photos.length}
              allowVideo={
                photoType !== "reference_photo" &&
                photoType !== "limitation"
              }
              onAddMedia={(files) => addFiles(files)}
            />

            <div className="rounded-2xl border border-slate-700 bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                    Step 1
                  </p>
                  <h2 className="text-xl font-black text-white">
                    Capture Evidence First
                  </h2>
                </div>
                <span className="rounded-full border border-teal-500/50 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-200">
                  Photo / Video
                </span>
              </div>

              <label className="mb-2 block font-bold">
                {photoType === "reference_photo"
                  ? "Reference Photos"
                  : photoType === "existing_finding"
                    ? "Photos / Videos to Append"
                    : "Media"}
              </label>
              <MediaUploadButtons
                photoType={photoType}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.currentTarget.value = "";
                }}
              />

              <p className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold leading-5 text-cyan-100">
                Use the Field Camera below for normal photo and video capture.
                It stays open while you switch modes. The AI Second Inspector
                Camera remains a separate tool below it.
              </p>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-700 bg-black/35 px-3 py-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Selected Media
                </span>
                <span className="rounded-full bg-teal-400 px-2.5 py-1 text-xs font-black text-black">
                  {photos.length}
                </span>
              </div>

              {photos.filter((photo) =>
                photo.type.startsWith("image/"),
              ).length >= 2 && photoType === "finding" && (
                <button
                  type="button"
                  onClick={organizeSelectedPhotosWithAI}
                  disabled={
                    organizingMedia ||
                    savingOrganizedMedia ||
                    !online
                  }
                  className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-400 bg-fuchsia-500/15 px-4 py-3 text-sm font-black text-fuchsia-100 transition active:scale-[0.98] hover:bg-fuchsia-500/25 disabled:opacity-50"
                >
                  {organizingMedia && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {organizingMedia
                    ? "Organizing Photos..."
                    : "✨ AI Organize Multi-Photo Session"}
                </button>
              )}

              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {photos.map((photo, index) => (
                    <MediaPreview
                      key={`${photo.name}-${photo.lastModified}-${index}`}
                      file={photo}
                      onMarkup={
                        photo.type.startsWith("image/")
                          ? () => openPhotoMarkup(index)
                          : undefined
                      }
                      onRemove={() => removePhoto(index)}
                    />
                  ))}
                </div>
              )}

              {uploadProgress.length > 0 && (
                <UploadProgressPanel items={uploadProgress} />
              )}
            </div>


            {photoType === "finding" && (
              <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4">
                <div className="mb-3">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-purple-300">
                    Step 2
                </p>
                <h2 className="text-xl font-black text-white">
                  Let AI Help Write It
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Take a photo first, analyze it as a defect, scan it as
                  equipment, dictate a finding, or type a rough note and
                  generate from the note.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <button
                  type="button"
                  onClick={analyzePhotoWithAI}
                  disabled={
                    analyzingPhoto ||
                    analyzingEquipment ||
                    generating ||
                    dictating ||
                    saving ||
                    savingEquipment ||
                    !online ||
                    !photos.some((photo) => photo.type.startsWith("image/"))
                  }
                  className="w-full rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-lg font-bold text-purple-200 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                >
                  {analyzingPhoto ? "Analyzing Defect..." : "🤖 Analyze Defect"}
                </button>

                <button
                  type="button"
                  onClick={analyzeEquipmentWithAI}
                  disabled={
                    analyzingEquipment ||
                    analyzingPhoto ||
                    generating ||
                    dictating ||
                    saving ||
                    savingEquipment ||
                    !online ||
                    !photos.some((photo) => photo.type.startsWith("image/"))
                  }
                  className="w-full rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-lg font-bold text-cyan-200 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                >
                  {analyzingEquipment
                    ? "Analyzing Equipment..."
                    : "🔧 Analyze Equipment"}
                </button>

                <button
                  type="button"
                  onClick={dictateFinding}
                  disabled={
                    generating ||
                    analyzingPhoto ||
                    analyzingEquipment ||
                    saving ||
                    savingEquipment
                  }
                  className="w-full rounded-xl border border-emerald-500 bg-emerald-500/10 p-4 text-lg font-bold text-emerald-200 transition active:scale-[0.98] hover:bg-emerald-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                >
                  {dictating ? "⏹ Stop Listening" : "🎤 Dictate Finding"}
                </button>

                <button
                  type="button"
                  onClick={generateWithAI}
                  disabled={
                    generating ||
                    dictating ||
                    analyzingPhoto ||
                    analyzingEquipment ||
                    saving ||
                    savingEquipment ||
                    !online
                  }
                  className="w-full rounded-xl bg-teal-500 p-4 text-lg font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                >
                  {generating
                    ? "Generating AI Finding..."
                    : online
                      ? "✍️ Generate From Note"
                      : "AI Available When Back Online"}
                </button>
              </div>
            </div>
            )}

            {equipmentResult && !equipmentResult.error && (
              <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                      Equipment Detected
                    </p>
                    <h2 className="mt-1 text-xl font-black text-white">
                      {cleanEquipmentValue(equipmentResult.manufacturer) ||
                        "Equipment"}{" "}
                      {cleanEquipmentValue(equipmentResult.equipmentType)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-300">
                      {shouldCreateEquipmentFinding(equipmentResult)
                        ? "This will save to Equipment Inventory and create a report finding because the analyzer found a reportable condition."
                        : "This will save to Equipment Inventory only and will not count as a defect."}
                    </p>
                  </div>

                  <span className="rounded-full border border-cyan-400/50 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
                    {shouldCreateEquipmentFinding(equipmentResult)
                      ? "Equipment + Finding"
                      : "Inventory Only"}
                  </span>
                </div>

                <EquipmentCard equipment={equipmentResult} />

                {equipmentResult.clientSummary && (
                  <div className="mt-4 rounded-xl border border-slate-700 bg-black/30 p-4 text-sm leading-6 text-slate-200">
                    {equipmentResult.clientSummary}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void saveEquipmentFromFieldTool()}
                  disabled={savingEquipment || analyzingEquipment || saving}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                >
                  {savingEquipment && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {savingEquipment ? equipmentSaveLabel : equipmentSaveLabel}
                </button>
              </div>
            )}

            {photoType === "existing_finding" && (
              <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
                <div className="mb-3">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-purple-300">
                    Attach Without Duplicating
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Select Existing Finding
                  </h2>
                  <p className="mt-1 text-sm text-purple-100/80">
                    The finding wording, severity, and current media stay unchanged.
                  </p>
                </div>

                <input
                  value={existingFindingSearch}
                  onChange={(event) =>
                    setExistingFindingSearch(event.target.value)
                  }
                  placeholder="Search title, section, or severity..."
                  className="mb-4 w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-purple-400"
                />

                {loadingExistingFindings ? (
                  <div className="rounded-xl border border-slate-700 bg-black/40 p-4 text-sm font-bold text-slate-300">
                    Loading report findings...
                  </div>
                ) : groupedExistingFindings.length === 0 ? (
                  <div className="rounded-xl border border-slate-700 bg-black/40 p-4 text-sm font-bold text-slate-300">
                    No matching findings were found.
                  </div>
                ) : (
                  <div className="max-h-[430px] space-y-4 overflow-y-auto pr-1">
                    {groupedExistingFindings.map(([groupSection, findings]) => (
                      <div key={groupSection}>
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                          {groupSection}
                        </p>

                        <div className="grid gap-2">
                          {findings.map((finding) => {
                            const selected =
                              String(existingFindingId) === String(finding.id);

                            return (
                              <button
                                key={finding.id}
                                type="button"
                                onClick={() =>
                                  setExistingFindingId(String(finding.id))
                                }
                                className={`w-full rounded-xl border p-3 text-left transition active:scale-[0.99] [touch-action:manipulation] ${
                                  selected
                                    ? "border-purple-300 bg-purple-500/30 ring-2 ring-purple-300/40"
                                    : "border-slate-700 bg-black/50 hover:border-purple-500/60 hover:bg-black/70"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="break-words font-black text-white">
                                      {finding.title || "Untitled Finding"}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-slate-400">
                                      {finding.severity || "No severity"}
                                    </p>
                                  </div>

                                  <span
                                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                                      selected
                                        ? "bg-purple-300 text-purple-950"
                                        : "border border-slate-600 text-slate-300"
                                    }`}
                                  >
                                    {selected ? "Selected" : "Choose"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedExistingFinding && (
                  <div className="mt-4 rounded-xl border border-purple-400/50 bg-black/40 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">
                      Adding Media To
                    </p>
                    <p className="mt-1 font-black text-white">
                      {selectedExistingFinding.title || "Untitled Finding"}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {selectedExistingFinding.section || "General"} ·{" "}
                      {selectedExistingFinding.severity || "No severity"}
                    </p>

                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                          Current Media
                        </p>
                        <span className="text-xs font-bold text-slate-400">
                          {loadingExistingFindingMedia
                            ? "Loading..."
                            : `${existingFindingMedia.length} item${
                                existingFindingMedia.length === 1 ? "" : "s"
                              }`}
                        </span>
                      </div>

                      {loadingExistingFindingMedia ? (
                        <div className="rounded-lg border border-slate-700 p-3 text-xs font-bold text-slate-400">
                          Loading attached media...
                        </div>
                      ) : existingFindingMedia.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {existingFindingMedia.map((media) => (
                            <ExistingFindingMediaPreview
                              key={String(media.id)}
                              media={media}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-600 p-3 text-xs font-bold text-slate-400">
                          No media is currently attached.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {mediaOrganizerOpen && (
              <div className="rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">
                      AI Media Organization
                    </p>
                    <h2 className="mt-1 text-xl font-black text-white">
                      Review Photo Groups
                    </h2>
                    <p className="mt-1 text-sm text-slate-300">
                      AI grouped related photos. Edit any assignment before
                      creating the findings.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMediaOrganizerOpen(false)}
                    className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-black text-slate-200"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {mediaGroups.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-xl border border-slate-700 bg-black/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-black text-white">
                            {group.label}
                          </p>
                          <p className="text-xs font-bold text-slate-400">
                            {group.photoIndexes.length} photo
                            {group.photoIndexes.length === 1 ? "" : "s"} ·{" "}
                            {Math.round((group.confidence || 0) * 100)}%
                          </p>
                        </div>

                        <select
                          value={group.classification}
                          onChange={(event) =>
                            updateMediaGroup(group.id, {
                              classification: event.target
                                .value as AIMediaGroup["classification"],
                            })
                          }
                          className="rounded-lg border border-slate-600 bg-black px-3 py-2 text-sm font-bold text-white"
                        >
                          <option value="finding">Finding</option>
                          <option value="reference">Reference</option>
                          <option value="equipment">Equipment</option>
                          <option value="limitation">Limitation</option>
                          <option value="unassigned">Unassigned</option>
                        </select>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <select
                          value={group.section}
                          onChange={(event) =>
                            updateMediaGroup(group.id, {
                              section: event.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-600 bg-black p-2 text-white"
                        >
                          {SECTIONS.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>

                        <select
                          value={group.severity}
                          onChange={(event) =>
                            updateMediaGroup(group.id, {
                              severity: event.target.value,
                            })
                          }
                          className="rounded-lg border border-slate-600 bg-black p-2 text-white"
                        >
                          {SEVERITIES.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </div>

                      <input
                        value={group.title}
                        onChange={(event) =>
                          updateMediaGroup(group.id, {
                            title: event.target.value,
                          })
                        }
                        className="mt-3 w-full rounded-lg border border-slate-600 bg-black p-3 font-black text-white"
                      />

                      <textarea
                        value={group.observation}
                        onChange={(event) =>
                          updateMediaGroup(group.id, {
                            observation: event.target.value,
                          })
                        }
                        rows={3}
                        className="mt-3 w-full rounded-lg border border-slate-600 bg-black p-3 text-white"
                        placeholder="Observation"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={saveOrganizedMediaGroups}
                  disabled={savingOrganizedMedia || organizingMedia}
                  className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-black disabled:opacity-50"
                >
                  {savingOrganizedMedia && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {savingOrganizedMedia
                    ? "Saving Groups..."
                    : "Accept Finding Groups and Save"}
                </button>
              </div>
            )}
{equipmentResult?.error && (
              <div className="rounded-xl border border-red-500/60 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                {equipmentResult.error || "Equipment analysis failed."}
              </div>
            )}

            {photoType === "finding" &&
              photos.some((photo) => photo.type.startsWith("video/")) &&
              !photos.some((photo) => photo.type.startsWith("image/")) && (
                <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm font-bold leading-6 text-yellow-100">
                  Video is saved with the finding, but AI photo recognition
                  needs at least one still photo. Add one photo if you want AI
                  to write the defect from media.
                </div>
              )}

            {photoType === "reference_photo" && (
              <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 text-sm leading-6 text-cyan-100">
                <p className="font-black text-cyan-300">Reference Photo Mode</p>
                <p className="mt-1">
                  Photos saved here will appear under Section Reference Photos
                  in the report/share/client views. They are not counted as
                  findings, defects, or repair request items.
                </p>
              </div>
            )}

            {photoType === "limitation" && (
              <div className="rounded-xl border border-orange-500/40 bg-orange-950/20 p-4 text-sm leading-6 text-orange-100">
                <p className="font-black text-orange-300">
                  Section Limitation + Photo
                </p>
                <p className="mt-1">
                  Add one photo showing the obstruction, access issue, stored
                  belongings, unsafe condition, or concealed area. AI will
                  automatically draft the limitation wording for your review.
                </p>

                <button
                  type="button"
                  onClick={() => void analyzeLimitationPhotoWithAI()}
                  disabled={
                    analyzingLimitation ||
                    !online ||
                    !photos.some((photo) => photo.type.startsWith("image/"))
                  }
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-400 px-4 py-2 text-sm font-black text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                >
                  {analyzingLimitation && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {analyzingLimitation
                    ? "Drafting Limitation..."
                    : "Draft Limitation From Photo"}
                </button>
              </div>
            )}

            {photoType !== "existing_finding" && (
              <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                  Step 3
              </p>

              <div>
                <label className="mb-2 block font-bold">Section</label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                >
                  {SECTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-5">
                <label className="mb-2 block font-bold">
                  {photoType === "reference_photo"
                    ? "Reference Photo Caption"
                    : photoType === "limitation"
                      ? "Limitation Wording"
                      : "Quick Inspector Note"}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder={
                    photoType === "reference_photo"
                      ? "Example: Main electrical panel overview, attic insulation overview, front elevation..."
                      : photoType === "limitation"
                        ? "Example: The rear roof slope was not fully visible due to dense tree coverage and could not be completely inspected."
                        : "Example: double tapped neutral in main panel, recommend electrician"
                  }
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
                />
              </div>

              {photoType === "limitation" && (
                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="mb-2 block font-bold">
                      Limitation Title
                    </label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Example: Rear roof slope not fully visible"
                      className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-bold">
                      Recommendation (Optional)
                    </label>
                    <textarea
                      value={recommendation}
                      onChange={(event) =>
                        setRecommendation(event.target.value)
                      }
                      rows={3}
                      placeholder="Example: Reinspect when vegetation is trimmed or access improves."
                      className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            {photoType === "finding" && (
              <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                  Step 4
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block font-bold">Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-bold">Severity</label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-black p-4 text-white"
                    >
                      {SEVERITIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
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
                </div>
              </div>
            )}


            <button
              type="button"
              onClick={saveFieldItem}
              disabled={
                saving ||
                savingEquipment ||
                analyzingLimitation ||
                (photoType === "existing_finding" &&
                  (!online || !existingFindingId || photos.length === 0)) ||
                (photoType === "reference_photo" && photos.length === 0) ||
                (photoType === "limitation" &&
                  (!online ||
                    !note.trim() ||
                    !photos.some((photo) => photo.type.startsWith("image/"))))
              }
              className={`w-full rounded-xl p-4 text-lg font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation] ${
                photoType === "reference_photo"
                  ? "bg-cyan-400 text-black hover:bg-cyan-300"
                  : photoType === "limitation"
                    ? "bg-orange-400 text-black hover:bg-orange-300"
                    : "bg-white text-black hover:bg-slate-200"
              }`}
            >
              {saving
                ? uploadProgress.some(
                    (item) =>
                      item.status === "uploading" ||
                      item.status === "processing",
                  )
                  ? "Saving + Uploading Media..."
                  : "Saving..."
                : photoType === "reference_photo"
                  ? online
                    ? "Save Section Reference Photo"
                    : "Save Section Reference Photo Offline"
                  : photoType === "limitation"
                    ? online
                      ? "Save Limitation + Photo"
                      : "Limitation Photo Needs Internet"
                  : photoType === "existing_finding"
                    ? online
                      ? "Attach Media to Selected Finding"
                      : "Existing Finding Media Needs Internet"
                    : online
                      ? "Save Finding to Report"
                      : "Save Finding Offline"}
            </button>



            {selectedReport && (
              <button
                type="button"
                onClick={() => {
                  if (!isOnline()) {
                    setShowOfflineReportViewer(true);
                    return;
                  }

                  router.push(`/reports/${selectedReport}`);
                }}
                className="block w-full rounded-xl border border-teal-500 p-4 text-center font-bold text-teal-400 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation]"
              >
                {online ? "Open This Report" : "Open Offline Report"}
              </button>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setVoiceOnlyOpen((current) => !current)}
                className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition active:scale-[0.98] [touch-action:manipulation] ${
                  voiceOnlyOpen
                    ? "border-emerald-400 bg-emerald-400 text-black"
                    : "border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                }`}
              >
                🎙️ {voiceOnlyOpen ? "Close Voice Inspection" : "Voice-Only Inspection"}
              </button>

              {voiceOnlyOpen && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <VoiceOnlyInspectionMode
                    inspectionId={selectedReport}
                    currentSection={section}
                    currentSeverity={severity}
                    online={online}
                  />
                </div>
              )}
            </div>

            {photoType === "existing_finding" && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                existingFindingId && photos.length > 0 && online
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/50 bg-amber-500/10 text-amber-100"
              }`}>
                {!existingFindingId
                  ? "Select the finding that should receive the media."
                  : photos.length === 0
                    ? "0 media selected. Take a photo/video or choose media first."
                    : !online
                      ? "The selected media is preserved, but attaching to an existing finding currently requires internet."
                      : `${photos.length} media item${photos.length === 1 ? "" : "s"} ready to attach to ${selectedExistingFinding?.title || "the selected finding"}.`}
              </div>
            )}


          </div>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <CommentLibrary onUseComment={useComment} />
        </div>
      </div>

      {markupPhotoIndex !== null && markupPhotoUrl && (
        <PhotoMarkupEditor
          imageUrl={markupPhotoUrl}
          severity={severity}
          onSave={saveFieldPhotoMarkup}
          onCancel={() => {
            if (savingMarkup) return;
            setMarkupPhotoIndex(null);
            setMarkupPhotoUrl("");
          }}
        />
      )}
    </main>
  );
}

function UploadProgressPanel({ items }: { items: UploadProgressItem[] }) {
  if (!items.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
          Media Backup / Upload Queue
        </p>
        <span className="rounded-full border border-cyan-400/40 px-3 py-1 text-xs font-black text-cyan-200">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-700 bg-black/35 p-3"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {item.type === "video"
                    ? "🎥"
                    : item.type === "thumbnail"
                      ? "🖼"
                      : "📷"}{" "}
                  {item.name}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-300">
                  {item.stage}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                  item.status === "done"
                    ? "border-green-400/50 bg-green-500/10 text-green-300"
                    : item.status === "queued"
                      ? "border-yellow-400/50 bg-yellow-500/10 text-yellow-300"
                      : item.status === "error"
                        ? "border-red-400/50 bg-red-500/10 text-red-300"
                        : "border-cyan-400/50 bg-cyan-500/10 text-cyan-300"
                }`}
              >
                {item.status === "done"
                  ? "Backed Up"
                  : item.status === "queued"
                    ? "Queued"
                    : item.status === "error"
                      ? "Needs Retry"
                      : "Working"}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{
                  width: `${Math.max(4, Math.min(100, item.progress))}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExistingFindingMediaPreview({
  media,
}: {
  media: ExistingFindingMedia;
}) {
  const isVideo =
    Boolean(media.is_video) ||
    String(media.mime_type || "").toLowerCase().startsWith("video/") ||
    /\.(mp4|mov|m4v|webm)(\?|$)/i.test(
      String(media.file_path || media.public_url || ""),
    );

  const mediaUrl = String(media.signed_url || media.public_url || "");
  const previewUrl = String(media.thumbnail_url || mediaUrl || "");

  return (
    <a
      href={mediaUrl || previewUrl || undefined}
      target="_blank"
      rel="noreferrer"
      className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-black"
      title={isVideo ? "Open attached video" : "Open attached photo"}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={isVideo ? "Attached video thumbnail" : "Attached finding photo"}
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl">
          {isVideo ? "🎥" : "📷"}
        </div>
      )}

      {isVideo && (
        <span className="absolute bottom-1 left-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-black text-white">
          VIDEO
        </span>
      )}
    </a>
  );
}

function MediaUploadButtons({
  photoType,
  onChange,
}: {
  photoType: PhotoType;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const imageOnlyMode =
    photoType === "reference_photo" || photoType === "limitation";

  return (
    <div className={`grid gap-3 ${imageOnlyMode ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black [touch-action:manipulation]">
        {photoType === "reference_photo"
          ? "🖼 Choose Reference Photos"
          : photoType === "limitation"
            ? "🖼 Choose Limitation Photo"
            : "🖼 Choose Photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      {!imageOnlyMode && (
        <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white [touch-action:manipulation]">
          🎥 Choose Videos
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={onChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

function MediaPreview({
  file,
  onMarkup,
  onRemove,
}: {
  file: File;
  onMarkup?: () => void;
  onRemove: () => void;
}) {
  const isVideo = file.type.startsWith("video/");
  const [url, setUrl] = useState("");
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [thumbnailReady, setThumbnailReady] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setPlayingVideo(false);
    setVideoThumbnailUrl("");
    setVideoDuration(0);
    setThumbnailReady(false);

    if (!file.type.startsWith("video/")) {
      return () => URL.revokeObjectURL(objectUrl);
    }

    const video = document.createElement("video");
    let cancelled = false;
    let thumbnailObjectUrl = "";
    let timeoutId = 0;

    const finishWithoutThumbnail = () => {
      if (cancelled) return;
      setThumbnailReady(true);
    };

    const captureFrame = () => {
      if (cancelled) return;

      try {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (!sourceWidth || !sourceHeight) {
          finishWithoutThumbnail();
          return;
        }

        const maxWidth = 720;
        const scale = Math.min(1, maxWidth / sourceWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          finishWithoutThumbnail();
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (cancelled || !blob) {
              finishWithoutThumbnail();
              return;
            }

            thumbnailObjectUrl = URL.createObjectURL(blob);
            setVideoThumbnailUrl(thumbnailObjectUrl);
            setThumbnailReady(true);
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        finishWithoutThumbnail();
      }
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      if (cancelled) return;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      setVideoDuration(duration);

      const targetTime =
        duration > 0
          ? Math.min(Math.max(duration * 0.2, 0.1), Math.max(0.1, duration - 0.05))
          : 0;

      try {
        video.currentTime = targetTime;
      } catch {
        captureFrame();
      }
    };

    video.onloadeddata = () => {
      if (!video.duration || video.currentTime > 0) {
        captureFrame();
      }
    };

    video.onseeked = captureFrame;
    video.onerror = finishWithoutThumbnail;

    timeoutId = window.setTimeout(finishWithoutThumbnail, 5000);
    video.load();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);

      if (thumbnailObjectUrl) {
        URL.revokeObjectURL(thumbnailObjectUrl);
      }
    };
  }, [file]);

  function formatVideoDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";

    const rounded = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(rounded / 60);
    const remainingSeconds = rounded % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
      {isVideo ? (
        playingVideo && url ? (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="h-40 w-full bg-black object-contain"
            onEnded={() => setPlayingVideo(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (url) setPlayingVideo(true);
            }}
            className="group relative block h-40 w-full overflow-hidden bg-slate-950 text-left"
            aria-label={`Play video ${file.name || ""}`.trim()}
          >
            {videoThumbnailUrl ? (
              <img
                src={videoThumbnailUrl}
                alt="Video thumbnail"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black">
                <span
                  className={`text-4xl transition ${
                    thumbnailReady ? "opacity-70" : "animate-pulse opacity-35"
                  }`}
                >
                  🎥
                </span>
              </div>
            )}

            <span className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" />

            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/90 bg-black/65 text-2xl text-white shadow-xl backdrop-blur transition group-active:scale-95">
              ▶
            </span>

            <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">
              Video
            </span>

            {videoDuration > 0 && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 text-xs font-black tabular-nums text-white backdrop-blur">
                {formatVideoDuration(videoDuration)}
              </span>
            )}
          </button>
        )
      ) : url ? (
        <img src={url} alt="Preview" className="h-40 w-full object-cover" />
      ) : (
        <div className="h-40 w-full bg-black" />
      )}

      <div className="grid grid-cols-2 border-t border-slate-700">
        {onMarkup ? (
          <button
            type="button"
            onClick={onMarkup}
            className="min-h-[42px] border-r border-slate-700 px-3 py-2 text-xs font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500/10 [touch-action:manipulation]"
          >
            ✏️ Mark Up
          </button>
        ) : (
          <div className="border-r border-slate-700" />
        )}

        <button
          type="button"
          onClick={onRemove}
          className="min-h-[42px] px-3 py-2 text-xs font-black text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 [touch-action:manipulation]"
        >
          Remove
        </button>
      </div>
    </div>
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
    <div>
      <label className="mb-2 block font-bold">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
      />
    </div>
  );
}
