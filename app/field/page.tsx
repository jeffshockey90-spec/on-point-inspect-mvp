"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { supabase } from "../../lib/supabaseClient";
import CommentLibrary from "../../components/CommentLibrary";
import OfflineSyncStatus from "../../components/OfflineSyncStatus";
import EquipmentCard from "../../components/EquipmentCard";
import AISecondInspector, {
  type AISuggestion,
} from "../../components/AISecondInspector";
import InspectionCopilotPanel from "../../components/InspectionCopilotPanel";
import {
  addOfflineQueueItem,
  filesToOfflinePhotos,
  getOfflineQueueSummary,
  isOnline,
} from "../../lib/offlineSyncQueue";

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

type PhotoType = "finding" | "reference_photo";

type UploadedPhoto = {
  publicUrl: string;
  filePath: string;
  isVideo?: boolean;
  mimeType?: string;
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
};

type UploadProgressItem = {
  id: string;
  name: string;
  type: "photo" | "video" | "thumbnail" | "offline";
  stage: string;
  progress: number;
  status: "pending" | "processing" | "uploading" | "queued" | "done" | "error";
};

function createLocalMediaId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isLikelyNetworkError(error: any) {
  const text = String(
    error?.message || error?.name || error || "",
  ).toLowerCase();

  return (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("failed to fetch") ||
    text.includes("load failed") ||
    text.includes("offline") ||
    text.includes("timeout") ||
    text.includes("storage") ||
    text.includes("upload")
  );
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
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [note, setNote] = useState("");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
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
  const [takingNativePhoto, setTakingNativePhoto] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    setNativeApp(isNativeCapacitorApp());
  }, []);
  const offlineSummary = useMemo(
    () => getOfflineQueueSummary(),
    [message, photos.length, online, queueTick],
  );

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
      setMessage(error.message);
      return;
    }

    setReports(data || []);
  }

  function resetForm() {
    setTitle("");
    setPhotoType("finding");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setNote("");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setPhotos([]);
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

  function setReferencePhotoMode() {
    setPhotoType("reference_photo");
    setTitle("");
    setSeverity("Informational");
    setObservation("");
    setImplication("");
    setRecommendation("");
    setMessage(
      "Reference photo mode selected. Add photo(s), choose a section, and save.",
    );
  }

  function addFiles(nextFiles: File[]) {
    const validFiles = nextFiles.filter((file) => {
      if (photoType === "reference_photo")
        return file.type.startsWith("image/");
      return file.type.startsWith("image/") || file.type.startsWith("video/");
    });

    if (validFiles.length !== nextFiles.length) {
      setMessage(
        photoType === "reference_photo"
          ? "Reference photos must be images. Videos can be saved as finding media."
          : "Some files were skipped because they were not supported media.",
      );
    }

    setEquipmentResult(null);
    setPhotos((current) => [...current, ...validFiles].slice(0, 6));

    if (validFiles.some((file) => file.type.startsWith("video/"))) {
      setMessage(
        nativeApp
          ? "Video added. iPhone camera videos remain in Photos, and the app will attach them to the report with upload status."
          : "Video added. The app will attach it to the report with upload status.",
      );
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
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
      });

      if (!image.webPath) {
        throw new Error("Camera did not return a usable photo path.");
      }

      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const fileName = `on-point-${Date.now()}.${image.format || "jpg"}`;
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
        lastModified: Date.now(),
      });

      addFiles([file]);
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

  async function saveEquipmentFromFieldTool() {
    if (!equipmentResult || savingEquipment || analyzingEquipment || saving)
      return;

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
      shouldCreateEquipmentFinding(equipmentResult)
        ? "Preparing Equipment + Finding..."
        : "Preparing Equipment Save...",
    );
    setMessage("");

    try {
      const uploadedPhotos: UploadedPhoto[] = [];

      for (const photo of photos) {
        uploadedPhotos.push(await uploadPhotoFile(photo, "equipment-media"));
      }

      const mainImage = uploadedPhotos.find((photo) =>
        String(photo.filePath || "").match(/\.(jpg|jpeg|png|webp|gif|heic)$/i),
      );

      setEquipmentSaveLabel("Saving Equipment Inventory...");

      const { error: inventoryError } = await supabase
        .from("equipment_inventory")
        .insert({
          inspection_id: Number(selectedReport),
          equipment_type: cleanEquipmentValue(equipmentResult.equipmentType),
          manufacturer: cleanEquipmentValue(equipmentResult.manufacturer),
          model: cleanEquipmentValue(equipmentResult.model),
          serial: cleanEquipmentValue(equipmentResult.serial),
          manufacture_year: cleanEquipmentValue(
            equipmentResult.manufactureYear,
          ),
          estimated_age: cleanEquipmentValue(equipmentResult.estimatedAge),
          expected_service_life: cleanEquipmentValue(
            equipmentResult.expectedServiceLife,
          ),
          estimated_life_remaining: "",
          refrigerant: cleanEquipmentValue(equipmentResult.refrigerant),
          condition: meaningfulEquipmentValue(
            cleanServiceLifeCondition(equipmentResult.condition),
          ),
          inspector_note: getAiInspectorNote(equipmentResult, note),
          maintenance_note: getAiMaintenanceNote(equipmentResult),
          equipment_status: getEquipmentStatusLabel(equipmentResult),
          image_url: mainImage?.publicUrl || "",
          file_path: mainImage?.filePath || "",
        });

      if (inventoryError) throw inventoryError;

      const createFinding = shouldCreateEquipmentFinding(equipmentResult);

      if (!createFinding) {
        resetForm();
        setMessage(
          "Equipment saved to Equipment Inventory. It was not added as a defect.",
        );
        return;
      }

      let equipmentTitle =
        `${cleanEquipmentValue(equipmentResult.manufacturer) || "Equipment"} ${
          cleanEquipmentValue(equipmentResult.equipmentType) || "Finding"
        }`.trim();

      const titlePrefix = getFindingTitlePrefix(equipmentResult);

      if (
        titlePrefix &&
        !equipmentTitle.toLowerCase().startsWith(titlePrefix.toLowerCase())
      ) {
        equipmentTitle = `${titlePrefix} – ${equipmentTitle}`;
      }

      const observationText = getCalmFindingObservation(equipmentResult);
      const implicationText = getCalmFindingImplication(equipmentResult);
      const recommendationText = getCalmFindingRecommendation(equipmentResult);
      const findingSeverity =
        titlePrefix === "Older Equipment"
          ? "Monitor"
          : equipmentResult.severity || "Informational";

      setEquipmentSaveLabel("Creating Finding...");

      const { data: findingData, error: findingError } = await supabase
        .from("findings")
        .insert({
          inspection_id: selectedReport,
          section: equipmentResult.section || "Heating",
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
        equipmentResult && shouldCreateEquipmentFinding(equipmentResult)
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

  async function uploadPhotoFile(
    photo: File,
    folder: string,
  ): Promise<UploadedPhoto> {
    let uploadFile = photo;
    let thumbnailFile: File | null = null;
    const isVideo = photo.type.startsWith("video/");
    const progressId = createLocalMediaId(photo);
    const progressType: UploadProgressItem["type"] = isVideo
      ? "video"
      : "photo";

    setMediaProgress(progressId, {
      name: photo.name || (isVideo ? "Inspection video" : "Inspection photo"),
      type: progressType,
      stage: isVideo ? "Preparing video backup" : "Preparing photo upload",
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

        setMessage("Video converted. Saving to report...");
        setMediaProgress(progressId, {
          name: photo.name || "Inspection video",
          type: progressType,
          stage: "Video converted",
          progress: 40,
          status: "processing",
        });
      } catch (error) {
        console.warn(
          "Video conversion failed. Saving original video instead.",
          error,
        );

        // Never block the inspector from saving the finding.
        // Mobile/Vercel video conversion can fail on large files or slow networks.
        // If conversion fails, save the original video and still attach it to the report.
        uploadFile = photo;
        setMessage(
          "Video conversion skipped. Saving original video to report...",
        );
        setMediaProgress(progressId, {
          name: photo.name || "Inspection video",
          type: progressType,
          stage: "Conversion skipped. Saving original video",
          progress: 35,
          status: "processing",
        });
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
    }

    const safeName = uploadFile.name
      .replace(/[^a-zA-Z0-9.\-_]/g, "-")
      .slice(0, 80);

    const fileName = `${selectedReport}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${safeName}`;

    setMediaProgress(progressId, {
      name:
        uploadFile.name ||
        photo.name ||
        (isVideo ? "Inspection video" : "Inspection photo"),
      type: progressType,
      stage: isVideo
        ? "Uploading video to report"
        : "Uploading photo to report",
      progress: isVideo ? 62 : 35,
      status: "uploading",
    });

    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, uploadFile, {
        cacheControl: "31536000",
        upsert: false,
        contentType: uploadFile.type || (isVideo ? "video/mp4" : undefined),
      });

    if (uploadError) {
      setMediaProgress(progressId, {
        name: uploadFile.name || photo.name || "Inspection media",
        type: progressType,
        stage: "Upload failed. Item can be saved to local queue",
        progress: 0,
        status: "error",
      });
      throw uploadError;
    }

    setMediaProgress(progressId, {
      name: uploadFile.name || photo.name || "Inspection media",
      type: progressType,
      stage: isVideo ? "Video uploaded" : "Photo uploaded",
      progress: isVideo ? 78 : 82,
      status: "uploading",
    });

    const { data } = supabase.storage
      .from("inspection-photos")
      .getPublicUrl(fileName);

    let thumbnailUrl: string | null = null;
    let thumbnailPath: string | null = null;

    if (thumbnailFile) {
      thumbnailPath = `${selectedReport}/${folder}/thumbnails/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-video-thumb.jpg`;

      setMediaProgress(progressId, {
        name: uploadFile.name || photo.name || "Inspection video",
        type: progressType,
        stage: "Uploading video thumbnail",
        progress: 86,
        status: "uploading",
      });

      const { error: thumbnailUploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(thumbnailPath, thumbnailFile, {
          cacheControl: "31536000",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (!thumbnailUploadError) {
        const { data: thumbnailData } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(thumbnailPath);

        thumbnailUrl = thumbnailData.publicUrl;
      } else {
        thumbnailPath = null;
      }
    }

    setMediaProgress(progressId, {
      name: uploadFile.name || photo.name || "Inspection media",
      type: progressType,
      stage: "Backed up to report",
      progress: 100,
      status: "done",
    });

    return {
      publicUrl: data.publicUrl,
      filePath: fileName,
      isVideo,
      mimeType: isVideo
        ? uploadFile.type || "video/mp4"
        : uploadFile.type || photo.type || "",
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
      });

      if (error) throw error;
      saved += 1;
    }

    return saved;
  }

  async function saveFindingOnline() {
    const uploadedPhotos: UploadedPhoto[] = [];

    for (const photo of photos) {
      uploadedPhotos.push(await uploadPhotoFile(photo, "field-media"));
    }

    const fallbackTitle =
      title.trim() || note.trim().slice(0, 80) || "Field Finding";
    const fallbackObservation =
      observation.trim() ||
      (note.trim() ? `Inspector field note: ${note.trim()}` : "");

    const { data: finding, error } = await supabase
      .from("findings")
      .insert({
        inspection_id: selectedReport,
        title: fallbackTitle,
        section,
        severity,
        observation: fallbackObservation,
        implication,
        recommendation,
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

    setSaving(true);
    setMessage("");

    try {
      if (!isOnline()) {
        const offlinePhotos = await filesToOfflinePhotos(photos);

        addOfflineQueueItem({
          type: photoType,
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
          },
        });

        resetForm();
        const summary = getOfflineQueueSummary();
        setMessage(
          photoType === "reference_photo"
            ? `Saved reference photo offline. Queue: ${summary.count} item(s). It will sync when service returns.`
            : `Saved finding offline. Queue: ${summary.count} item(s). It will sync when service returns.`,
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

      await saveFindingOnline();
      resetForm();
      setMessage("Finding saved to report.");
    } catch (error: any) {
      const shouldQueueAfterFailure =
        photos.length > 0 && (isLikelyNetworkError(error) || !isOnline());

      if (shouldQueueAfterFailure) {
        try {
          const offlinePhotos = await filesToOfflinePhotos(photos);

          addOfflineQueueItem({
            type: photoType,
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
            },
          });

          photos.forEach((photo) => {
            setMediaProgress(createLocalMediaId(photo), {
              name: photo.name || "Inspection media",
              type: photo.type.startsWith("video/") ? "video" : "photo",
              stage: "Saved locally. Will retry when signal returns",
              progress: 100,
              status: "queued",
            });
          });

          resetForm();
          const summary = getOfflineQueueSummary();
          setMessage(
            `Signal/upload issue detected. Saved locally instead of losing work. Queue: ${summary.count} item(s). It will sync when service returns.`,
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

  return (
    <main className="min-h-screen bg-[#0f172a] p-4 text-white">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl bg-[#111827] p-5 shadow-2xl">
          <h1 className="mb-2 text-3xl font-bold text-teal-400">
            On Point Field Workflow
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
                onChange={(e) => setSelectedReport(e.target.value)}
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
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setPhotoType("finding")}
                className={`rounded-xl border p-4 text-left transition active:scale-[0.98] [touch-action:manipulation] ${
                  photoType === "finding"
                    ? "border-teal-400 bg-teal-500/20 text-teal-200"
                    : "border-slate-700 bg-black text-slate-300 hover:bg-slate-900"
                }`}
              >
                <span className="block text-lg font-black">
                  Finding / Defect
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Creates a report finding and can include photos or video.
                </span>
              </button>

              <button
                type="button"
                onClick={setReferencePhotoMode}
                className={`rounded-xl border p-4 text-left transition active:scale-[0.98] [touch-action:manipulation] ${
                  photoType === "reference_photo"
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-700 bg-black text-slate-300 hover:bg-slate-900"
                }`}
              >
                <span className="block text-lg font-black">
                  Section Reference Photo
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Saves photos to Section Reference Photos only, not defects.
                </span>
              </button>
            </div>

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
                {photoType === "reference_photo" ? "Reference Photos" : "Media"}
              </label>
              <MediaUploadButtons
                nativeApp={nativeApp}
                takingNativePhoto={takingNativePhoto}
                photoType={photoType}
                onNativeTakePhoto={takeNativePhotoAndSaveToGallery}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.currentTarget.value = "";
                }}
              />

              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {photos.map((photo, index) => (
                    <MediaPreview
                      key={`${photo.name}-${photo.lastModified}-${index}`}
                      file={photo}
                      onRemove={() => removePhoto(index)}
                    />
                  ))}
                </div>
              )}

              {uploadProgress.length > 0 && (
                <UploadProgressPanel items={uploadProgress} />
              )}
            </div>

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
                    photoType === "reference_photo" ||
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
                    photoType === "reference_photo" ||
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
                    savingEquipment ||
                    photoType === "reference_photo"
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
                    !online ||
                    photoType === "reference_photo"
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
                  onClick={saveEquipmentFromFieldTool}
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
                    : "Quick Inspector Note"}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder={
                    photoType === "reference_photo"
                      ? "Example: Main electrical panel overview, attic insulation overview, front elevation..."
                      : "Example: double tapped neutral in main panel, recommend electrician"
                  }
                  className="w-full rounded-xl border border-slate-700 bg-black p-4 leading-7 text-white"
                />
              </div>
            </div>

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
              disabled={saving || savingEquipment}
              className={`w-full rounded-xl p-4 text-lg font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation] ${
                photoType === "reference_photo"
                  ? "bg-cyan-400 text-black hover:bg-cyan-300"
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
                  : online
                    ? "Save Finding to Report"
                    : "Save Finding Offline"}
            </button>

            {selectedReport && (
              <a
                href={`/reports/${selectedReport}`}
                className="block rounded-xl border border-teal-500 p-4 text-center font-bold text-teal-400 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation]"
              >
                Open This Report
              </a>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {selectedReport && (
            <InspectionCopilotPanel
              inspectionId={String(selectedReport)}
              compact
            />
          )}

          <AISecondInspector
            suggestions={aiSuggestions}
            onAccept={acceptAiSuggestion}
            onIgnore={ignoreAiSuggestion}
            onClear={() => setAiSuggestions([])}
          />

          <CommentLibrary onUseComment={useComment} />
        </div>
      </div>
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

function MediaUploadButtons({
  nativeApp,
  takingNativePhoto,
  photoType,
  onNativeTakePhoto,
  onChange,
}: {
  nativeApp: boolean;
  takingNativePhoto: boolean;
  photoType: PhotoType;
  onNativeTakePhoto: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const referenceMode = photoType === "reference_photo";

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {nativeApp ? (
        <button
          type="button"
          onClick={onNativeTakePhoto}
          disabled={takingNativePhoto}
          className="rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {takingNativePhoto
            ? "Opening Camera..."
            : referenceMode
              ? "📷 Take Reference + Save Gallery"
              : "📷 Take Photo + Save Gallery"}
        </button>
      ) : (
        <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-teal-300 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black [touch-action:manipulation]">
          {referenceMode ? "📷 Take Reference Photos" : "📷 Take Photos"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onChange}
            className="hidden"
          />
        </label>
      )}

      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-black [touch-action:manipulation]">
        {referenceMode ? "🖼 Choose Reference Photos" : "🖼 Choose Photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      {!referenceMode && (
        <>
          <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 transition active:scale-[0.98] hover:bg-purple-500 hover:text-white [touch-action:manipulation]">
            🎥 Record Video
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={onChange}
              className="hidden"
            />
          </label>

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
        </>
      )}
    </div>
  );
}

function MediaPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
      {file.type.startsWith("video/") ? (
        url ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="h-40 w-full bg-black object-contain"
          />
        ) : (
          <div className="h-40 w-full bg-black" />
        )
      ) : url ? (
        <img src={url} alt="Preview" className="h-40 w-full object-cover" />
      ) : (
        <div className="h-40 w-full bg-black" />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="w-full border-t border-slate-700 px-3 py-2 text-xs font-black text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 [touch-action:manipulation]"
      >
        Remove
      </button>
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
