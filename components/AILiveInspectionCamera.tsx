"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LiveSectionCoach from "./LiveSectionCoach";
import LiveInspectionScore from "./LiveInspectionScore";
import LiveInspectionTimelinePanel from "./LiveInspectionTimelinePanel";
import LiveHouseIntelligencePanel from "./LiveHouseIntelligencePanel";
import VoiceFindingGenerator from "./VoiceFindingGenerator";
import { saveFileToDeviceGallery } from "../lib/nativeGallery";
import {
  mergeLiveDetections,
  toggleTrackedDetectionPin,
  type LiveTrackedDetection,
} from "../lib/ai/LiveVisionTracker";

const MAX_DISMISSED_AGE_MS = 8 * 60 * 1000;
const RESURFACE_CONFIDENCE_BOOST = 0.12;

function getLiveMemoryKey(inspectionId: string) {
  return `opi-ai-live-memory-${String(inspectionId || "").trim()}`;
}

type PersistedLiveMemory = {
  dismissed?: Record<string, { confidence: number; at: number }>;
  snoozed?: Record<string, { until: number; confidence: number }>;
  handledReminders?: Record<string, boolean>;
};

function readLiveMemory(inspectionId: string): PersistedLiveMemory {
  if (typeof window === "undefined" || !inspectionId) return {};

  try {
    const raw = window.localStorage.getItem(getLiveMemoryKey(inspectionId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLiveMemory(
  inspectionId: string,
  dismissed: Record<string, { confidence: number; at: number }>,
  snoozed: Record<string, { until: number; confidence: number }>,
  handledReminders: Record<string, boolean>,
) {
  if (typeof window === "undefined" || !inspectionId) return;

  try {
    window.localStorage.setItem(
      getLiveMemoryKey(inspectionId),
      JSON.stringify({
        dismissed,
        snoozed,
        handledReminders,
      }),
    );
  } catch {}
}

export type AILiveSuggestion = {
  id?: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  confidence?: number;
  evidence?: string[];
  suggestionType?:
    | "defect"
    | "maintenance"
    | "documentation"
    | "safety"
    | string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
    approximate?: boolean;
  } | null;
};

type AILiveReminder = {
  id?: string;
  title: string;
  detail?: string;
  priority?: "low" | "medium" | "high" | string;
  action?: "scan_data_plate" | "check" | "document" | "photo" | string;
  confidence?: number;
};

type AILiveLimitation = {
  id?: string;
  title: string;
  section?: string;
  limitation: string;
  reason?: string;
  recommendation?: string;
  confidence?: number;
};

type LiveMemoryStatus = "active" | "snoozed" | "completed" | "ignored";

type LiveMemoryItem = {
  key: string;
  title: string;
  kind: "suggestion" | "reminder" | "limitation" | "data_plate";
  severity?: string;
  confidence?: number;
  createdAt: number;
  updatedAt?: number;
  status?: LiveMemoryStatus;
  suggestion?: AILiveSuggestion;
  reminder?: AILiveReminder;
  limitation?: AILiveLimitation;
  dataPlatePrompt?: AILiveResult["dataPlatePrompt"];
};

type PendingEvidenceCapture =
  | {
      kind: "finding";
      suggestion: AILiveSuggestion;
    }
  | {
      kind: "limitation";
      limitation: AILiveLimitation;
      index: number;
    };

type AILiveResult = {
  area?: string;
  system?: string;
  confidence?: number;
  suggestions?: AILiveSuggestion[];
  reminders?: AILiveReminder[];
  limitations?: AILiveLimitation[];
  dataPlatePrompt?: {
    needed?: boolean;
    reason?: string;
    equipmentType?: string;
  };
  summary?: string;
};

type EvidenceReview = {
  usable: boolean;
  overallScore: number;
  sharpness: "good" | "acceptable" | "poor";
  lighting: "good" | "acceptable" | "poor";
  framing: "good" | "acceptable" | "poor";
  distance: "good" | "too_far" | "too_close" | "unknown";
  subjectVisible: boolean;
  requiredEvidenceSatisfied: boolean;
  missingElements: string[];
  guidance: string;
  confidence: number;
};

type PendingEvidenceReview = {
  review: EvidenceReview;
  file: File;
  title: string;
};

type Props = {
  online: boolean;
  selectedReport: string;
  currentSection: string;
  currentSeverity: string;
  onUseSuggestion: (suggestion: AILiveSuggestion, frame?: File | null) => void;
  onAddPhotoOnly: (frame: File) => void;
  onScanDataPlate: (frame?: File | null) => void;
  destinationLabel?: string;
  selectedMediaCount?: number;
};

function normalizeSuggestionConcept(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(blocked|blocking|blockage|clogged|clogging|debris-filled)\b/g, "obstruction")
    .replace(/\b(damaged|damage|defective|defect)\b/g, "damage")
    .replace(/\b(missing|absent|not present)\b/g, "missing")
    .replace(/\b(improper|incorrect|poorly installed)\b/g, "improper")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createSuggestionKey(suggestion: AILiveSuggestion) {
  return [
    normalizeSuggestionConcept(suggestion.section),
    normalizeSuggestionConcept(suggestion.suggestionType || "defect"),
    normalizeSuggestionConcept(suggestion.title),
  ]
    .filter(Boolean)
    .join(":");
}

function createReminderKey(reminder: AILiveReminder) {
  return [reminder.id, reminder.title, reminder.action]
    .map((value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join(":");
}

function normalizeConfidence(value: any) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 1) return Math.min(1, number / 100);
  return Math.max(0, Math.min(1, number));
}

function confidenceLabel(value: any) {
  const confidence = normalizeConfidence(value);
  return `${Math.round(confidence * 100)}%`;
}

function formatMemoryTime(value: number) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function livePriority(value: {
  severity?: string;
  suggestionType?: string;
  priority?: string;
  confidence?: number;
}) {
  const severity = String(value.severity || "").toLowerCase();
  const suggestionType = String(value.suggestionType || "").toLowerCase();
  const priority = String(value.priority || "").toLowerCase();
  const confidence = normalizeConfidence(value.confidence);

  if (
    severity.includes("safety") ||
    severity.includes("major") ||
    suggestionType.includes("safety") ||
    priority === "high"
  ) {
    return 4;
  }

  if (severity.includes("repair") || confidence >= 0.88) return 3;
  if (severity.includes("monitor") || priority === "medium") return 2;
  return 1;
}

function shouldInterruptCamera(value: {
  severity?: string;
  suggestionType?: string;
  priority?: string;
  confidence?: number;
}) {
  return livePriority(value) >= 3;
}

const LIVE_SCAN_INTERVAL_OPTIONS = [3, 5, 8, 10, 15, 30];

function getLiveScanIntervalKey(inspectionId: string) {
  return `opi-ai-live-scan-seconds-${String(inspectionId || "").trim()}`;
}

function mapRegionToObjectCover(
  region: NonNullable<AILiveSuggestion["region"]>,
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoomLevel = 1,
  hardwareZoom = false,
) {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return {
      left: `${region.x * 100}%`,
      top: `${region.y * 100}%`,
      width: `${region.width * 100}%`,
      height: `${region.height * 100}%`,
    };
  }

  const scale = Math.max(
    viewportWidth / sourceWidth,
    viewportHeight / sourceHeight,
  );
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (viewportWidth - renderedWidth) / 2;
  const offsetY = (viewportHeight - renderedHeight) / 2;
  const digitalZoom = hardwareZoom ? 1 : Math.max(1, zoomLevel);
  const zoomedWidth = renderedWidth * digitalZoom;
  const zoomedHeight = renderedHeight * digitalZoom;
  const zoomOffsetX = (viewportWidth - zoomedWidth) / 2;
  const zoomOffsetY = (viewportHeight - zoomedHeight) / 2;

  const leftPx =
    region.x * sourceWidth * scale * digitalZoom +
    (digitalZoom > 1 ? zoomOffsetX : offsetX);
  const topPx =
    region.y * sourceHeight * scale * digitalZoom +
    (digitalZoom > 1 ? zoomOffsetY : offsetY);
  const widthPx = region.width * sourceWidth * scale * digitalZoom;
  const heightPx = region.height * sourceHeight * scale * digitalZoom;

  const clippedLeft = Math.max(0, leftPx);
  const clippedTop = Math.max(0, topPx);
  const clippedRight = Math.min(viewportWidth, leftPx + widthPx);
  const clippedBottom = Math.min(viewportHeight, topPx + heightPx);

  return {
    left: `${(clippedLeft / viewportWidth) * 100}%`,
    top: `${(clippedTop / viewportHeight) * 100}%`,
    width: `${Math.max(0, ((clippedRight - clippedLeft) / viewportWidth) * 100)}%`,
    height: `${Math.max(0, ((clippedBottom - clippedTop) / viewportHeight) * 100)}%`,
  };
}

function createLimitationText(limitation: AILiveLimitation) {
  const parts = [
    limitation.limitation,
    limitation.reason ? `Reason: ${limitation.reason}` : "",
    limitation.recommendation
      ? `Recommendation: ${limitation.recommendation}`
      : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

function dataUrlToFile(dataUrl: string, namePrefix = "ai-live-frame") {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], `${namePrefix}-${Date.now()}.jpg`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not prepare the evidence photo."));
    reader.readAsDataURL(file);
  });
}


export default function AILiveInspectionCamera({
  online,
  selectedReport,
  currentSection,
  currentSeverity,
  onUseSuggestion,
  onAddPhotoOnly,
  onScanDataPlate,
  destinationLabel = "New Finding",
  selectedMediaCount = 0,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const dismissedRef = useRef<
    Record<string, { confidence: number; at: number }>
  >({});
  const snoozedRef = useRef<
    Record<string, { until: number; confidence: number }>
  >({});
  const autoScanRunningRef = useRef(false);
  const hardwareZoomSupportedRef = useRef(false);
  const focusResetTimerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [torchOn, setTorchOn] = useState(false);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [focusMessage, setFocusMessage] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(3);
  const [liveMemoryItems, setLiveMemoryItems] = useState<LiveMemoryItem[]>([]);
  const [scanIntervalSeconds, setScanIntervalSeconds] = useState(8);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [activeRegionSuggestions, setActiveRegionSuggestions] = useState<
    LiveTrackedDetection<AILiveSuggestion>[]
  >([]);
  const gallerySavedKeysRef = useRef<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [autoWatch, setAutoWatch] = useState(true);
  const [lastAutoScanAt, setLastAutoScanAt] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [frameDataUrl, setFrameDataUrl] = useState("");
  const latestFrameRef = useRef("");
  const [result, setResult] = useState<AILiveResult | null>(null);
  const [waitingForDecision, setWaitingForDecision] = useState(false);
  const [message, setMessage] = useState("");
  const [savingLimitationIndex, setSavingLimitationIndex] = useState<
    number | null
  >(null);
  const [handledReminderKeys, setHandledReminderKeys] = useState<
    Record<string, boolean>
  >({});
  const [liveNoticeVisible, setLiveNoticeVisible] = useState(true);
  const [pendingEvidenceCapture, setPendingEvidenceCapture] =
    useState<PendingEvidenceCapture | null>(null);
  const [selectedMemoryKey, setSelectedMemoryKey] = useState("");
  const [memoryHistoryOpen, setMemoryHistoryOpen] = useState(false);
  const [cockpitView, setCockpitView] = useState<
    "queue" | "coach" | "score" | "timeline" | "house" | "voice"
  >("queue");
  const [coachCaptureIssue, setCoachCaptureIssue] = useState<{
    id: string;
    title: string;
    recommendation?: string;
  } | null>(null);
  const [evidenceChecking, setEvidenceChecking] = useState(false);
  const [pendingEvidenceReview, setPendingEvidenceReview] =
    useState<PendingEvidenceReview | null>(null);
  const pendingEvidenceAcceptRef = useRef<(() => void | Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    function handleCoachCapture(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      setCoachCaptureIssue({
        id: String(detail.id || detail.title || "coach-evidence"),
        title: String(detail.title || "Section Coach evidence"),
        recommendation: String(detail.recommendation || ""),
      });
      setDetailsOpen(false);
      setMessage(`Capture a clear photo for "${String(detail.title || "this coach item")}".`);
    }

    function handleCoachLimitation(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      setCockpitView("queue");
      setDetailsOpen(false);
      setMessage(`Add a limitation for "${String(detail.title || "this item")}" from the Field Tool if it could not be inspected.`);
    }

    window.addEventListener("opi:coach-capture-request", handleCoachCapture as EventListener);
    window.addEventListener("opi:coach-limitation-request", handleCoachLimitation as EventListener);
    return () => {
      window.removeEventListener("opi:coach-capture-request", handleCoachCapture as EventListener);
      window.removeEventListener("opi:coach-limitation-request", handleCoachLimitation as EventListener);
    };
  }, []);

  const frameFile = useMemo(() => {
    if (!frameDataUrl) return null;

    try {
      return dataUrlToFile(frameDataUrl);
    } catch {
      return null;
    }
  }, [frameDataUrl]);

  const liveMemoryStorageKey = useMemo(
    () => `opi-ai-live-items-${String(selectedReport || "").trim()}`,
    [selectedReport],
  );

  useEffect(() => {
    if (!selectedReport || typeof window === "undefined") {
      setLiveMemoryItems([]);
      return;
    }

    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(liveMemoryStorageKey) || "[]",
      );
      const normalized = Array.isArray(parsed)
        ? parsed.map((item: LiveMemoryItem) => ({
            ...item,
            status: item.status || "active",
            updatedAt: item.updatedAt || item.createdAt || Date.now(),
          }))
        : [];
      setLiveMemoryItems(normalized.slice(0, 40));
    } catch {
      setLiveMemoryItems([]);
    }
  }, [selectedReport, liveMemoryStorageKey]);

  function persistLiveMemory(items: LiveMemoryItem[]) {
    const next = items.slice(0, 40);
    try {
      window.localStorage.setItem(liveMemoryStorageKey, JSON.stringify(next));
    } catch {}
    return next;
  }

  function updateLiveMemoryItem(key: string, updates: Partial<LiveMemoryItem>) {
    setLiveMemoryItems((current) =>
      persistLiveMemory(
        current.map((item) =>
          item.key === key
            ? {
                ...item,
                ...updates,
                updatedAt: Date.now(),
              }
            : item,
        ),
      ),
    );
  }

  function appendLiveMemory(data: AILiveResult) {
    const now = Date.now();
    const nextItems: LiveMemoryItem[] = [
      ...(data.suggestions || []).map((item) => ({
        key: `suggestion:${createSuggestionKey(item)}`,
        title: item.title,
        kind: "suggestion" as const,
        severity: item.severity,
        confidence: item.confidence,
        createdAt: now,
        updatedAt: now,
        status: "active" as const,
        suggestion: item,
      })),
      ...(data.reminders || []).map((item) => ({
        key: `reminder:${createReminderKey(item)}`,
        title: item.title,
        kind: "reminder" as const,
        confidence: item.confidence,
        createdAt: now,
        updatedAt: now,
        status: "active" as const,
        reminder: item,
      })),
      ...(data.limitations || []).map((item) => ({
        key: `limitation:${String(item.id || item.title).toLowerCase()}`,
        title: item.title,
        kind: "limitation" as const,
        confidence: item.confidence,
        createdAt: now,
        updatedAt: now,
        status: "active" as const,
        limitation: item,
      })),
      ...(data.dataPlatePrompt?.needed
        ? [
            {
              key: `data-plate:${String(data.dataPlatePrompt.equipmentType || data.area || "equipment").toLowerCase()}`,
              title:
                data.dataPlatePrompt.reason ||
                "Equipment data plate should be captured",
              kind: "data_plate" as const,
              createdAt: now,
              updatedAt: now,
              status: "active" as const,
              dataPlatePrompt: data.dataPlatePrompt,
            },
          ]
        : []),
    ].filter((item) => item.key && item.title);

    if (!nextItems.length) return;

    setLiveMemoryItems((current) => {
      const byKey = new Map(current.map((item) => [item.key, item]));

      for (const incoming of nextItems) {
        const existing = byKey.get(incoming.key);
        if (!existing) {
          byKey.set(incoming.key, incoming);
          continue;
        }

        const previousConfidence = normalizeConfidence(existing.confidence);
        const nextConfidence = normalizeConfidence(incoming.confidence);
        const shouldResurface =
          existing.status === "ignored" &&
          nextConfidence >= previousConfidence + RESURFACE_CONFIDENCE_BOOST;

        byKey.set(incoming.key, {
          ...existing,
          ...incoming,
          createdAt: existing.createdAt || incoming.createdAt,
          status: shouldResurface ? "active" : existing.status || "active",
          updatedAt: now,
        });
      }

      return persistLiveMemory(
        Array.from(byKey.values()).sort(
          (a, b) =>
            Number(b.updatedAt || b.createdAt) -
            Number(a.updatedAt || a.createdAt),
        ),
      );
    });
  }

  const visibleSuggestions = useMemo(() => {
    const suggestions = result?.suggestions || [];
    const now = Date.now();

    return suggestions.filter((suggestion) => {
      const key = createSuggestionKey(suggestion);
      if (!key) return true;

      const nextConfidence = normalizeConfidence(suggestion.confidence);
      const snoozed = snoozedRef.current[key];
      if (
        snoozed &&
        now < snoozed.until &&
        nextConfidence < snoozed.confidence + RESURFACE_CONFIDENCE_BOOST
      ) {
        return false;
      }

      if (snoozed && now >= snoozed.until) {
        delete snoozedRef.current[key];
      }

      const dismissed = dismissedRef.current[key];
      if (!dismissed) return true;

      const isOldDismissal = now - dismissed.at > MAX_DISMISSED_AGE_MS;
      const confidenceImproved =
        nextConfidence >= dismissed.confidence + RESURFACE_CONFIDENCE_BOOST;

      return isOldDismissal || confidenceImproved;
    });
  }, [result]);

  const visibleReminders = useMemo(() => {
    const reminders = result?.reminders || [];
    return reminders.filter((reminder) => {
      const key = createReminderKey(reminder);
      return !key || !handledReminderKeys[key];
    });
  }, [result, handledReminderKeys]);

  useEffect(() => {
    if (!selectedReport) return;

    const memory = readLiveMemory(selectedReport);
    dismissedRef.current = memory.dismissed || {};
    snoozedRef.current = memory.snoozed || {};
    setHandledReminderKeys(memory.handledReminders || {});
  }, [selectedReport]);

  useEffect(() => {
    writeLiveMemory(
      selectedReport,
      dismissedRef.current,
      snoozedRef.current,
      handledReminderKeys,
    );
  }, [selectedReport, handledReminderKeys]);

  useEffect(() => {
    if (!selectedReport || typeof window === "undefined") return;

    const saved = Number(
      window.localStorage.getItem(getLiveScanIntervalKey(selectedReport)),
    );

    if (LIVE_SCAN_INTERVAL_OPTIONS.includes(saved)) {
      setScanIntervalSeconds(saved);
    }
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        getLiveScanIntervalKey(selectedReport),
        String(scanIntervalSeconds),
      );
    } catch {}
  }, [selectedReport, scanIntervalSeconds]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setInterval(() => {
      const cutoff = Date.now() - Math.max(24000, scanIntervalSeconds * 3500);
      setActiveRegionSuggestions((current) =>
        current.filter((item) => item.pinned || item.lastSeenAt >= cutoff),
      );
    }, 2000);

    return () => window.clearInterval(timer);
  }, [open, scanIntervalSeconds]);

  useEffect(() => {
    if (!open) {
      setWaitingForDecision(false);
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !autoWatch || !online || !selectedReport) return;

    const intervalMs = Math.max(3000, scanIntervalSeconds * 1000);

    const runScan = () => {
      const now = Date.now();

      if (autoScanRunningRef.current) return;
      if (analyzing || starting) return;
      if (now - lastAutoScanAt < intervalMs - 250) return;

      void autoAnalyzeFrame();
    };

    const firstScan = window.setTimeout(
      runScan,
      Math.min(1800, Math.max(900, intervalMs / 3)),
    );
    const interval = window.setInterval(runScan, intervalMs);

    return () => {
      window.clearTimeout(firstScan);
      window.clearInterval(interval);
    };
  }, [
    open,
    autoWatch,
    online,
    selectedReport,
    analyzing,
    starting,
    lastAutoScanAt,
    scanIntervalSeconds,
  ]);

  function recordMemoryEvent({
    eventType,
    status,
    title,
    detail,
    confidence,
    payload,
    section,
  }: {
    eventType: string;
    status: string;
    title?: string;
    detail?: string;
    confidence?: number;
    payload?: Record<string, any>;
    section?: string;
  }) {
    if (!selectedReport) return;

    void fetch("/api/ai/inspection-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId: selectedReport,
        section: section || currentSection,
        eventType,
        status,
        title,
        detail,
        confidence,
        payload: payload || {},
      }),
    }).catch(() => undefined);
  }

  function recordInspectorLearning({
    tool,
    original,
    updated,
    accepted,
    confidence,
    notes,
  }: {
    tool: string;
    original: Record<string, any>;
    updated: Record<string, any>;
    accepted: boolean | null;
    confidence?: number;
    notes: string;
  }) {
    if (!selectedReport) return;

    void fetch("/api/ai/learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId: selectedReport,
        tool,
        original,
        updated,
        accepted,
        confidence,
        notes,
      }),
    }).catch(() => undefined);
  }

  async function startCamera(mode: "environment" | "user" = facingMode) {
    if (starting) return;

    setStarting(true);
    setCameraError("");
    setMessage("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera is not supported on this device/browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 24 },
          advanced: [
            { focusMode: "continuous" },
            { exposureMode: "continuous" },
          ] as any,
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48000 },
        },
      });

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities =
        videoTrack?.getCapabilities?.() as MediaTrackCapabilities & {
          zoom?: { min?: number; max?: number; step?: number };
        };
      const settings = videoTrack?.getSettings?.() as MediaTrackSettings & {
        zoom?: number;
      };
      const supportsHardwareZoom = Boolean(
        capabilities?.zoom?.max && capabilities.zoom.max > 1,
      );
      hardwareZoomSupportedRef.current = supportsHardwareZoom;
      setZoomMin(
        supportsHardwareZoom
          ? Math.max(1, Number(capabilities.zoom?.min || 1))
          : 1,
      );
      setZoomMax(
        supportsHardwareZoom
          ? Math.min(8, Number(capabilities.zoom?.max || 3))
          : 3,
      );
      setZoomLevel(Math.max(1, Number(settings?.zoom || 1)));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setMessage(
        "AI Live Camera is suggestions-only. Nothing saves until the inspector confirms.",
      );
    } catch (error: any) {
      setCameraError(error?.message || "Could not start camera.");
    } finally {
      setStarting(false);
    }
  }

  function stopCamera() {
    if (focusResetTimerRef.current) {
      window.clearTimeout(focusResetTimerRef.current);
      focusResetTimerRef.current = null;
    }
    setFocusPoint(null);
    setFocusMessage("");

    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setRecordingVideo(false);

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    hardwareZoomSupportedRef.current = false;
    setZoomLevel(1);
    setZoomMin(1);
    setZoomMax(3);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFrame(options: { silent?: boolean } = {}) {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      if (!options.silent) setMessage("Camera frame is not ready yet.");
      return "";
    }

    // Keep enough detail for inspection evidence and photo markup.
    const maxWidth = 1920;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      if (!options.silent) setMessage("Could not capture camera frame.");
      return "";
    }

    if (!hardwareZoomSupportedRef.current && zoomLevel > 1) {
      const sourceWidth = video.videoWidth / zoomLevel;
      const sourceHeight = video.videoHeight / zoomLevel;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    } else {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    latestFrameRef.current = dataUrl;
    setFrameDataUrl(dataUrl);
    if (!options.silent) {
      setMessage("Frame captured. Review, analyze, or add it as a photo.");
    }
    return dataUrl;
  }

  async function handleCameraTapFocus(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (starting || recordingVideo) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    setFocusPoint({ x, y });
    setFocusMessage("Focusing…");

    const track = streamRef.current?.getVideoTracks?.()[0];

    try {
      if (track) {
        const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
          focusMode?: string[];
        };

        const advanced: any[] = [];
        if (Array.isArray(capabilities?.focusMode)) {
          if (capabilities.focusMode.includes("single-shot")) {
            advanced.push({ focusMode: "single-shot" });
          } else if (capabilities.focusMode.includes("continuous")) {
            advanced.push({ focusMode: "continuous" });
          }
        }

        if (advanced.length > 0) {
          await track.applyConstraints({ advanced } as any);
          setFocusMessage("Focus adjusted");
        } else {
          setFocusMessage("Continuous focus active");
        }
      }
    } catch {
      setFocusMessage("Continuous focus active");
    }

    if (focusResetTimerRef.current) {
      window.clearTimeout(focusResetTimerRef.current);
    }

    focusResetTimerRef.current = window.setTimeout(() => {
      setFocusPoint(null);
      setFocusMessage("");
      focusResetTimerRef.current = null;
    }, 1400);
  }

  async function handlePrimaryCapture() {
    if (captureMode === "video") {
      toggleVideoRecording();
      return;
    }

    await quickAddPhoto();
  }

  async function toggleFacingCamera() {
    if (starting) return;

    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    stopCamera();

    window.setTimeout(() => {
      void startCamera(nextMode);
    }, 120);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];

    if (!track) {
      setMessage("Flash is not available until the camera is ready.");
      return;
    }

    try {
      const capabilities =
        track.getCapabilities?.() as MediaTrackCapabilities & {
          torch?: boolean;
        };

      if (!capabilities?.torch) {
        setMessage("Flash is not supported by this camera.");
        return;
      }

      const next = !torchOn;

      await track.applyConstraints({
        advanced: [{ torch: next } as any],
      });

      setTorchOn(next);
    } catch {
      setMessage("Flash could not be changed on this device.");
    }
  }

  async function handleZoomChange(nextValue: number) {
    const next = Math.max(zoomMin, Math.min(zoomMax, nextValue));
    setZoomLevel(next);

    if (!hardwareZoomSupportedRef.current) return;

    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;

    try {
      await track.applyConstraints({ advanced: [{ zoom: next } as any] });
    } catch {
      hardwareZoomSupportedRef.current = false;
    }
  }

  async function saveSelectedMediaToGallery(file: File | null | undefined) {
    if (!file) return false;

    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (gallerySavedKeysRef.current.has(key)) return true;

    try {
      const saved = await saveFileToDeviceGallery(file);
      if (saved) gallerySavedKeysRef.current.add(key);
      return saved;
    } catch (error) {
      console.error("AI camera gallery save failed:", error);
      return false;
    }
  }

  async function validateEvidenceBeforeSave({
    file,
    title,
    evidenceType,
    requiredElements = [],
    onAccept,
  }: {
    file: File;
    title: string;
    evidenceType: string;
    requiredElements?: string[];
    onAccept: () => void | Promise<void>;
  }) {
    if (!online) {
      await onAccept();
      return;
    }

    setEvidenceChecking(true);
    setPendingEvidenceReview(null);
    pendingEvidenceAcceptRef.current = null;
    setMessage("Checking photo quality and required evidence...");

    try {
      const imageDataUrl = await fileToDataUrl(file);
      const response = await fetch("/api/ai/evidence-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          imageDataUrl,
          inspectionId: selectedReport,
          section: currentSection,
          evidenceType,
          subject: title,
          requiredElements,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.review) {
        setMessage(
          data?.message ||
            data?.error ||
            "Evidence validation was unavailable. The photo was saved normally.",
        );
        await onAccept();
        return;
      }

      const review = data.review as EvidenceReview;

      recordMemoryEvent({
        eventType: "evidence_review",
        status: review.usable ? "accepted" : "retake_requested",
        title,
        detail: review.guidance,
        confidence: review.confidence,
        payload: {
          evidenceType,
          overallScore: review.overallScore,
          sharpness: review.sharpness,
          lighting: review.lighting,
          framing: review.framing,
          distance: review.distance,
          requiredEvidenceSatisfied: review.requiredEvidenceSatisfied,
          missingElements: review.missingElements,
        },
      });

      if (review.usable && review.requiredEvidenceSatisfied) {
        setMessage(`✓ Evidence accepted: ${review.guidance}`);
        await onAccept();
        return;
      }

      pendingEvidenceAcceptRef.current = onAccept;
      setPendingEvidenceReview({ review, file, title });
      setMessage("This photo may not provide complete evidence. Review the guidance.");
    } catch (error: any) {
      setMessage(
        error?.message ||
          "Evidence validation was unavailable. The photo was saved normally.",
      );
      await onAccept();
    } finally {
      setEvidenceChecking(false);
    }
  }

  async function acceptPendingEvidenceAnyway() {
    const accept = pendingEvidenceAcceptRef.current;
    pendingEvidenceAcceptRef.current = null;
    setPendingEvidenceReview(null);
    setMessage("Photo accepted by inspector.");
    if (accept) await accept();
  }

  function retakePendingEvidence() {
    pendingEvidenceAcceptRef.current = null;
    setPendingEvidenceReview(null);
    setFrameDataUrl("");
    latestFrameRef.current = "";
    setMessage("Retake the photo using the evidence guidance.");
  }

  async function quickAddPhoto() {
    const captured = captureFrame({ silent: true });
    if (!captured || evidenceChecking) return;

    try {
      if (pendingEvidenceCapture?.kind === "finding") {
        const file = dataUrlToFile(captured, "ai-live-finding");
        await validateEvidenceBeforeSave({
          file,
          title: pendingEvidenceCapture.suggestion.title,
          evidenceType: "finding",
          requiredElements: [
            "The reported condition is clearly visible",
            "Enough surrounding context is shown to identify the location",
          ],
          onAccept: async () => {
            completeSuggestionWithEvidence(
              pendingEvidenceCapture.suggestion,
              file,
            );
            setPendingEvidenceCapture(null);
          },
        });
        return;
      }

      if (pendingEvidenceCapture?.kind === "limitation") {
        const file = dataUrlToFile(captured, "ai-live-limitation");
        await validateEvidenceBeforeSave({
          file,
          title: pendingEvidenceCapture.limitation.title,
          evidenceType: "limitation",
          requiredElements: [
            "The obstruction or access limitation is visible",
            "Enough context is shown to support the limitation",
          ],
          onAccept: async () => {
            await saveLimitationToSection(
              pendingEvidenceCapture.limitation,
              pendingEvidenceCapture.index,
              captured,
            );
            setPendingEvidenceCapture(null);
          },
        });
        return;
      }

      const file = dataUrlToFile(
        captured,
        coachCaptureIssue ? "ai-coach-evidence" : "ai-live-photo",
      );

      const saveRegularPhoto = async () => {
        onAddPhotoOnly(file);
        if (coachCaptureIssue) {
          recordMemoryEvent({
            eventType: "section_coach_item",
            status: "saved",
            title: coachCaptureIssue.title,
            detail:
              coachCaptureIssue.recommendation ||
              "Requested evidence photo captured.",
            payload: { issueId: coachCaptureIssue.id, action: "photo" },
          });
          window.dispatchEvent(
            new CustomEvent("opi:section-coach-refresh", {
              detail: {
                inspectionId: selectedReport,
                section: currentSection,
              },
            }),
          );
          setCoachCaptureIssue(null);
        }
        void saveSelectedMediaToGallery(file);
        setFrameDataUrl("");
        latestFrameRef.current = "";
        setMessage(
          "Photo added to the Field Tool. Camera remains open for the next capture.",
        );
        recordMemoryEvent({
          eventType: "live_camera_media",
          status: "saved",
          title: "Live camera photo captured",
          detail: `Photo added while inspecting ${currentSection}.`,
          payload: { mediaType: "photo", evidenceValidated: online },
        });
      };

      await validateEvidenceBeforeSave({
        file,
        title: coachCaptureIssue?.title || `${currentSection} evidence photo`,
        evidenceType: coachCaptureIssue ? "section_coach" : "documentation",
        requiredElements: coachCaptureIssue?.recommendation
          ? [coachCaptureIssue.recommendation]
          : ["The intended inspection subject is visible and in focus"],
        onAccept: saveRegularPhoto,
      });
    } catch (error: any) {
      setMessage(error?.message || "Could not add the live camera photo.");
    }
  }

  function toggleVideoRecording() {
    const stream = streamRef.current;

    if (recordingVideo) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        setRecordingVideo(false);
      }
      return;
    }

    if (!stream || typeof MediaRecorder === "undefined") {
      setMessage(
        "Video recording is not supported by this device/browser. Use Choose Videos in the Field Tool.",
      );
      return;
    }

    try {
      const supportedTypes = [
        "video/mp4;codecs=h264,aac",
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType =
        supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
        "";
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 10_000_000,
        audioBitsPerSecond: 128_000,
        ...(mimeType ? { mimeType } : {}),
      };
      const recorder = new MediaRecorder(stream, recorderOptions);

      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecordingVideo(false);

        if (!chunks.length) {
          setMessage("No video data was captured.");
          return;
        }

        const type = recorder.mimeType || chunks[0]?.type || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const file = new File(
          chunks,
          `ai-live-video-${Date.now()}.${extension}`,
          {
            type,
            lastModified: Date.now(),
          },
        );

        onAddPhotoOnly(file);
        void saveSelectedMediaToGallery(file);
        setMessage(
          "High-quality video added to the current Field Tool destination and queued for the device gallery.",
        );
        recordMemoryEvent({
          eventType: "live_camera_media",
          status: "saved",
          title: "Live camera video captured",
          detail: `Video added while inspecting ${currentSection}.`,
          payload: { mediaType: "video", mimeType: type, size: file.size },
        });
      };

      recorder.onerror = () => {
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        setRecordingVideo(false);
        setMessage(
          "Video recording failed. Use Choose Videos in the Field Tool.",
        );
      };

      recorder.start(500);
      setRecordingVideo(true);
      setMessage(
        "Recording video... tap Stop Video when finished. The camera remains open.",
      );
    } catch (error: any) {
      setRecordingVideo(false);
      setMessage(error?.message || "Could not start video recording.");
    }
  }

  async function analyzeCurrentFrame() {
    if (!selectedReport) {
      setMessage("Select a report before using AI Live Camera.");
      return;
    }

    if (!online) {
      setMessage(
        "AI Live Camera analysis needs internet. You can still capture a photo and save it offline.",
      );
      return;
    }

    const dataUrl = frameDataUrl || captureFrame();
    if (!dataUrl) return;

    setAnalyzing(true);
    setMessage("");
    setResult(null);
    setWaitingForDecision(false);

    try {
      const res = await fetch("/api/ai/live-inspection-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          inspectionId: selectedReport,
          currentSection,
          currentSeverity,
          mode: "manual",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "AI Live Camera analysis failed.");
        return;
      }

      setHandledReminderKeys({});
      setResult(data);
      appendLiveMemory(data);
      const hasManualResult =
        (Array.isArray(data.suggestions) && data.suggestions.length > 0) ||
        (Array.isArray(data.limitations) && data.limitations.length > 0) ||
        (Array.isArray(data.reminders) && data.reminders.length > 0) ||
        Boolean(data?.dataPlatePrompt?.needed);
      setWaitingForDecision(hasManualResult);
      const count = Array.isArray(data.suggestions)
        ? data.suggestions.length
        : 0;
      const reminderCount = Array.isArray(data.reminders)
        ? data.reminders.length
        : 0;
      const limitationCount = Array.isArray(data.limitations)
        ? data.limitations.length
        : 0;
      setMessage(
        `AI reviewed this area. ${count} suggestion${count === 1 ? "" : "s"}, ${reminderCount} reminder${reminderCount === 1 ? "" : "s"}, and ${limitationCount} limitation${limitationCount === 1 ? "" : "s"} found. Inspector approval is required.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "AI Live Camera analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function autoAnalyzeFrame() {
    if (!selectedReport || !online || autoScanRunningRef.current) return;

    const dataUrl = captureFrame({ silent: true });
    if (!dataUrl) return;

    autoScanRunningRef.current = true;
    setLastAutoScanAt(Date.now());

    try {
      const res = await fetch("/api/ai/live-inspection-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          inspectionId: selectedReport,
          currentSection,
          currentSeverity,
          mode: "live_watch",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const suggestions = Array.isArray(data.suggestions)
        ? data.suggestions
        : [];
      const reminders = Array.isArray(data.reminders) ? data.reminders : [];
      const limitations = Array.isArray(data.limitations)
        ? data.limitations
        : [];

      // Every AI observation is retained in Live Memory, but only safety,
      // major, strong repair, and high-priority coach items interrupt the camera.
      appendLiveMemory(data);

      const interruptingSuggestions = suggestions.filter((item: any) =>
        shouldInterruptCamera(item),
      );

      const highPriorityReminders = reminders.filter(
        (item: any) => String(item?.priority || "").toLowerCase() === "high",
      );

      const shouldInterrupt =
        interruptingSuggestions.length > 0 || highPriorityReminders.length > 0;

      if (!shouldInterrupt) {
        setWaitingForDecision(false);
        return;
      }

      setHandledReminderKeys({});
      const liveResult = {
        ...data,
        suggestions: interruptingSuggestions,
        limitations: [],
        reminders: highPriorityReminders,
      };

      setResult((current) => ({
        ...current,
        ...liveResult,
        suggestions: liveResult.suggestions || [],
        reminders: liveResult.reminders || [],
        limitations: liveResult.limitations || [],
      }));

      const localized = (liveResult.suggestions || [])
        .filter((item: AILiveSuggestion) => Boolean(item.region))
        .map((item: AILiveSuggestion) => ({
          ...item,
          detectedAt: Date.now(),
        }));

      if (localized.length) {
        setActiveRegionSuggestions((current) =>
          mergeLiveDetections(current, localized, {
            now: Date.now(),
            staleAfterMs: Math.max(9000, scanIntervalSeconds * 1600),
            removeAfterMs: Math.max(24000, scanIntervalSeconds * 3500),
            maxTracks: 8,
          }),
        );
      } else {
        setActiveRegionSuggestions((current) =>
          mergeLiveDetections(current, [], {
            now: Date.now(),
            staleAfterMs: Math.max(9000, scanIntervalSeconds * 1600),
            removeAfterMs: Math.max(24000, scanIntervalSeconds * 3500),
            maxTracks: 8,
          }),
        );
      }

      setWaitingForDecision(false);

      setMessage(
        `AI Second Inspector noticed something in ${data.area || currentSection}. Review before saving anything.`,
      );
    } catch {
      // Silent failure in live watch mode so it does not interrupt the inspector.
    } finally {
      autoScanRunningRef.current = false;
    }
  }

  function beginSuggestionEvidenceCapture(suggestion: AILiveSuggestion) {
    setPendingEvidenceCapture({
      kind: "finding",
      suggestion,
    });
    setDetailsOpen(false);
    setActionsOpen(false);
    setLiveNoticeVisible(false);
    setMessage(
      `Take a clear photo to complete "${suggestion.title}". The finding will not move forward until the photo is captured.`,
    );
  }

  function completeSuggestionWithEvidence(
    suggestion: AILiveSuggestion,
    selectedFrame: File,
  ) {
    onUseSuggestion(suggestion, selectedFrame);
    void saveSelectedMediaToGallery(selectedFrame);
    recordInspectorLearning({
      tool: "ai_live_camera_suggestion",
      original: suggestion,
      updated: { ...suggestion, decision: "accepted_with_photo" },
      accepted: true,
      confidence: normalizeConfidence(suggestion.confidence),
      notes:
        "Inspector accepted this live-camera suggestion and captured required photo evidence. Reinforce similar visible conditions, wording, severity, and section routing.",
    });
    recordMemoryEvent({
      eventType: "live_camera_suggestion",
      status: "accepted",
      title: suggestion.title,
      detail: suggestion.observation,
      confidence: suggestion.confidence,
      section: suggestion.section || currentSection,
      payload: {
        severity: suggestion.severity,
        suggestionType: suggestion.suggestionType,
        recommendation: suggestion.recommendation,
        evidenceRequired: true,
        evidenceCaptured: true,
      },
    });

    const findingChangeDetail = {
      inspectionId: selectedReport,
      section: suggestion.section || currentSection,
    };

    window.dispatchEvent(
      new CustomEvent("opi:findings-changed", {
        detail: findingChangeDetail,
      }),
    );

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("opi:findings-changed", {
          detail: findingChangeDetail,
        }),
      );
    }, 900);

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("opi:findings-changed", {
          detail: findingChangeDetail,
        }),
      );
    }, 1800);

    setResult(null);
    setWaitingForDecision(false);
    setFrameDataUrl("");
    latestFrameRef.current = "";

    updateLiveMemoryItem(`suggestion:${createSuggestionKey(suggestion)}`, {
      status: "completed",
    });
    setSelectedMemoryKey("");
    setMessage(
      "Photo captured and finding loaded into the Field Tool. Review the wording and tap Save Finding.",
    );
  }

  function snoozeSuggestion(suggestion: AILiveSuggestion) {
    const key = createSuggestionKey(suggestion);
    if (key) {
      snoozedRef.current[key] = {
        until: Date.now() + 5 * 60 * 1000,
        confidence: normalizeConfidence(suggestion.confidence),
      };
      writeLiveMemory(
        selectedReport,
        dismissedRef.current,
        snoozedRef.current,
        handledReminderKeys,
      );
    }

    recordInspectorLearning({
      tool: "ai_live_camera_suggestion",
      original: suggestion,
      updated: { ...suggestion, decision: "remind_later" },
      accepted: null,
      confidence: normalizeConfidence(suggestion.confidence),
      notes:
        "Inspector postponed this suggestion. Do not treat it as rejected; preserve it as a lower-interruption reminder preference.",
    });

    recordMemoryEvent({
      eventType: "live_camera_suggestion",
      status: "remind_later",
      title: suggestion.title,
      detail: suggestion.observation,
      confidence: suggestion.confidence,
      section: suggestion.section || currentSection,
      payload: { snoozedUntil: Date.now() + 5 * 60 * 1000 },
    });

    updateLiveMemoryItem(`suggestion:${createSuggestionKey(suggestion)}`, {
      status: "snoozed",
    });
    setSelectedMemoryKey("");
    setResult(null);
    setWaitingForDecision(false);
    setMessage("Reminder snoozed for five minutes. AI Watching resumed.");
  }

  function ignoreSuggestion(suggestion: AILiveSuggestion) {
    recordInspectorLearning({
      tool: "ai_live_camera_suggestion",
      original: suggestion,
      updated: { ...suggestion, decision: "ignored" },
      accepted: false,
      confidence: normalizeConfidence(suggestion.confidence),
      notes:
        "Inspector rejected this live-camera suggestion. Reduce similar low-value interruptions while never suppressing clear safety concerns.",
    });

    recordMemoryEvent({
      eventType: "live_camera_suggestion",
      status: "ignored",
      title: suggestion.title,
      detail: suggestion.observation,
      confidence: suggestion.confidence,
      section: suggestion.section || currentSection,
      payload: {
        severity: suggestion.severity,
        suggestionType: suggestion.suggestionType,
      },
    });

    const key = createSuggestionKey(suggestion);
    if (key) {
      dismissedRef.current[key] = {
        confidence: normalizeConfidence(suggestion.confidence),
        at: Date.now(),
      };
      writeLiveMemory(
        selectedReport,
        dismissedRef.current,
        snoozedRef.current,
        handledReminderKeys,
      );
    }

    updateLiveMemoryItem(`suggestion:${createSuggestionKey(suggestion)}`, {
      status: "ignored",
    });
    setSelectedMemoryKey("");
    setResult(null);
    setWaitingForDecision(false);

    setMessage("Suggestion dismissed. AI Watching resumed.");
  }

  function beginLimitationEvidenceCapture(
    limitation: AILiveLimitation,
    index: number,
  ) {
    setPendingEvidenceCapture({
      kind: "limitation",
      limitation,
      index,
    });
    setDetailsOpen(false);
    setActionsOpen(false);
    setLiveNoticeVisible(false);
    setMessage(
      `Take a clear photo to complete "${limitation.title}". The limitation will not be saved until the photo is captured.`,
    );
  }

  async function saveLimitationToSection(
    limitation: AILiveLimitation,
    index: number,
    requiredFrameDataUrl?: string,
  ) {
    if (!selectedReport) {
      setMessage("Select a report before adding a limitation.");
      return;
    }

    if (savingLimitationIndex !== null) return;

    const targetSection = limitation.section || currentSection;
    const cleanLimitation = String(limitation.limitation || "").trim();
    const cleanReason = String(limitation.reason || "").trim();
    const cleanRecommendation = String(limitation.recommendation || "").trim();

    if (!cleanLimitation) {
      setMessage("AI limitation did not include enough detail to save.");
      return;
    }

    setSavingLimitationIndex(index);
    setMessage("Saving limitation and attaching photo...");

    try {
      let savedFrame =
        requiredFrameDataUrl || latestFrameRef.current || frameDataUrl || "";

      if (!savedFrame) {
        savedFrame = captureFrame({ silent: true });
      }

      if (!savedFrame) {
        throw new Error(
          "Could not capture the camera image. Keep the camera open and try Add To Section Limitations again.",
        );
      }

      const response = await fetch("/api/ai/live-limitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          inspectionId: String(selectedReport),
          section: targetSection,
          title: limitation.title || "AI Limitation Note",
          limitation: cleanLimitation,
          reason: cleanReason,
          recommendation: cleanRecommendation,
          imageDataUrl: savedFrame,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            data?.photoError ||
            `Failed to add limitation. Server returned ${response.status}.`,
        );
      }

      if (!data?.photo?.id && !data?.photoId) {
        throw new Error(
          data?.photoError ||
            "The limitation saved, but the photo did not attach. Check the limitation_photos table schema.",
        );
      }

      window.dispatchEvent(
        new CustomEvent("opi:section-limitations-changed", {
          detail: {
            inspectionId: selectedReport,
            section: targetSection,
            limitationId: data.limitation?.id || data.limitationId || null,
            photoId: data.photo?.id || data.photoId || null,
          },
        }),
      );

      const limitationGalleryFile = dataUrlToFile(
        savedFrame,
        "ai-live-limitation",
      );
      void saveSelectedMediaToGallery(limitationGalleryFile);
      recordInspectorLearning({
        tool: "ai_live_camera_limitation",
        original: limitation as any,
        updated: { ...limitation, decision: "accepted" },
        accepted: true,
        confidence: normalizeConfidence(limitation.confidence),
        notes:
          "Inspector accepted this limitation. Learn preferred limitation wording and when this type of visibility restriction is useful.",
      });

      setResult(null);
      setWaitingForDecision(false);
      setFrameDataUrl("");
      latestFrameRef.current = "";

      updateLiveMemoryItem(
        `limitation:${String(limitation.id || limitation.title).toLowerCase()}`,
        { status: "completed" },
      );
      setSelectedMemoryKey("");
      setMessage(
        `Photo captured and limitation completed in ${targetSection}. The image was also queued for the device gallery.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to add limitation to section.");
    } finally {
      setSavingLimitationIndex(null);
    }
  }

  function resolveReminder(reminder: AILiveReminder, nextMessage: string) {
    const key = createReminderKey(reminder);

    if (key) {
      setHandledReminderKeys((current) => ({
        ...current,
        [key]: true,
      }));
      updateLiveMemoryItem(`reminder:${key}`, {
        status: nextMessage.toLowerCase().includes("ignored")
          ? "ignored"
          : "completed",
      });
      setSelectedMemoryKey("");
    }

    setResult((current) => {
      if (!current) return current;

      const remainingReminders = (current.reminders || []).filter(
        (item) => createReminderKey(item) !== key,
      );

      const hasPending =
        (current.suggestions || []).length > 0 ||
        (current.limitations || []).length > 0 ||
        remainingReminders.length > 0 ||
        Boolean(current.dataPlatePrompt?.needed);

      if (!hasPending) {
        setWaitingForDecision(false);
        return null;
      }

      return {
        ...current,
        reminders: remainingReminders,
      };
    });

    setMessage(nextMessage);
  }

  function markReminderChecked(reminder: AILiveReminder) {
    recordInspectorLearning({
      tool: "ai_section_coach",
      original: reminder,
      updated: { ...reminder, decision: "checked" },
      accepted: true,
      confidence: normalizeConfidence(reminder.confidence),
      notes:
        "Inspector confirmed this Section Coach item was useful and completed it.",
    });
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "checked",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: reminder.action, priority: reminder.priority },
    });
    resolveReminder(
      reminder,
      "Checklist reminder marked complete. AI Watching can continue when all prompts are handled.",
    );
  }

  function saveReminderPhoto(reminder: AILiveReminder) {
    const captured =
      frameFile ||
      (captureFrame({ silent: true })
        ? dataUrlToFile(latestFrameRef.current)
        : null);

    if (!captured) {
      setMessage("Capture a frame before adding this reminder photo.");
      return;
    }

    onAddPhotoOnly(captured);
    void saveSelectedMediaToGallery(captured);
    recordInspectorLearning({
      tool: "ai_section_coach",
      original: reminder,
      updated: { ...reminder, decision: "photo_saved" },
      accepted: true,
      confidence: normalizeConfidence(reminder.confidence),
      notes:
        "Inspector responded to this Section Coach reminder by saving the requested evidence photo.",
    });
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "saved",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: "photo" },
    });
    resolveReminder(
      reminder,
      "Reminder photo saved. AI Watching can continue when all prompts are handled.",
    );
  }

  function ignoreReminder(reminder: AILiveReminder) {
    recordInspectorLearning({
      tool: "ai_section_coach",
      original: reminder,
      updated: { ...reminder, decision: "ignored" },
      accepted: false,
      confidence: normalizeConfidence(reminder.confidence),
      notes:
        "Inspector dismissed this Section Coach reminder. Reduce similar low-value reminders for this inspector.",
    });
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "ignored",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: reminder.action },
    });
    resolveReminder(
      reminder,
      "Reminder ignored for now. AI Watching can continue when all prompts are handled.",
    );
  }

  function addPhotoOnly() {
    if (!frameFile) {
      const captured = captureFrame();
      if (!captured) return;
      const nextFile = dataUrlToFile(captured);
      onAddPhotoOnly(nextFile);
      void saveSelectedMediaToGallery(nextFile);
      setResult(null);
      setWaitingForDecision(false);
      setMessage("Photo saved. AI Watching can continue scanning.");
      return;
    }

    onAddPhotoOnly(frameFile);
    void saveSelectedMediaToGallery(frameFile);
    setResult(null);
    setWaitingForDecision(false);
    setMessage("Photo saved. AI Watching can continue scanning.");
  }

  const prioritizedSuggestions = useMemo(
    () =>
      [...visibleSuggestions].sort(
        (a, b) =>
          livePriority(b) - livePriority(a) ||
          normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence),
      ),
    [visibleSuggestions],
  );

  const prioritizedReminders = useMemo(
    () =>
      [...visibleReminders].sort(
        (a, b) =>
          livePriority(b) - livePriority(a) ||
          normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence),
      ),
    [visibleReminders],
  );

  const primarySuggestion =
    prioritizedSuggestions.find((item) => shouldInterruptCamera(item)) || null;
  const primaryReminder =
    prioritizedReminders.find((item) => shouldInterruptCamera(item)) || null;

  const noticeKey = [
    primarySuggestion ? createSuggestionKey(primarySuggestion) : "",
    primaryReminder ? createReminderKey(primaryReminder) : "",
  ]
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    if (!noticeKey) {
      setLiveNoticeVisible(false);
      return;
    }

    setLiveNoticeVisible(true);
    const timer = window.setTimeout(() => setLiveNoticeVisible(false), 6500);
    return () => window.clearTimeout(timer);
  }, [noticeKey]);

  const displayedRegionSuggestions = useMemo(() => {
    const preciseOrPersisted =
      activeRegionSuggestions.length > 0
        ? activeRegionSuggestions
        : visibleSuggestions.map((suggestion, index) => ({
            ...suggestion,
            trackId:
              suggestion.id || `${createSuggestionKey(suggestion)}-${index}`,
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            seenCount: 1,
            smoothedConfidence: normalizeConfidence(suggestion.confidence),
            stale: false,
            pinned: false,
          }));

    if (preciseOrPersisted.length > 0) {
      const ordered = [...preciseOrPersisted].sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          livePriority(b) - livePriority(a) ||
          normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence),
      );

      return ordered.slice(0, 1).map((suggestion) => ({
        ...suggestion,
        region: suggestion.region || {
          x: 0.17,
          y: 0.22,
          width: 0.56,
          height: 0.34,
          label: suggestion.title,
          approximate: true,
        },
      }));
    }

    const limitation = result?.limitations?.[0];

    if (limitation) {
      return [
        {
          id: limitation.id || "live-limitation-box",
          title: limitation.title || "AI review area",
          section: limitation.section || currentSection,
          severity: "Informational",
          observation: limitation.limitation,
          implication: limitation.reason || "",
          recommendation: limitation.recommendation || "",
          confidence: limitation.confidence,
          suggestionType: "documentation",
          trackId: "live-limitation-box",
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          seenCount: 1,
          smoothedConfidence: normalizeConfidence(limitation.confidence),
          stale: false,
          pinned: false,
          region: {
            x: 0.16,
            y: 0.2,
            width: 0.58,
            height: 0.36,
            label: limitation.title || "AI review area",
            approximate: true,
          },
        } as LiveTrackedDetection<AILiveSuggestion>,
      ];
    }

    return [];
  }, [
    activeRegionSuggestions,
    visibleSuggestions,
    result?.limitations,
    currentSection,
  ]);

  const activeMemoryItems = useMemo(
    () =>
      liveMemoryItems.filter(
        (item) =>
          (item.status || "active") === "active" || item.status === "snoozed",
      ),
    [liveMemoryItems],
  );

  const memoryHistoryItems = useMemo(
    () =>
      liveMemoryItems.filter(
        (item) => item.status === "completed" || item.status === "ignored",
      ),
    [liveMemoryItems],
  );

  const pendingCount = activeMemoryItems.length;
  const coachMemoryCount = activeMemoryItems.filter(
    (item) => item.kind === "reminder",
  ).length;
  const additionalDetectionCount = Math.max(
    0,
    activeRegionSuggestions.filter((item) => !item.stale).length -
      displayedRegionSuggestions.length,
  );

  const cameraUi = !open ? (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
        Field Camera
      </p>
      <h2 className="mt-1 text-xl font-black">Photo + Video Camera</h2>
      <p className="mt-1 text-sm text-slate-300">
        Open once and switch between Photo and Video without closing the camera.
        Media is added to <strong>{destinationLabel}</strong>.
      </p>
      <button
        type="button"
        onClick={() => {
          setAutoWatch(online);
          setOpen(true);
          window.setTimeout(() => void startCamera(facingMode), 50);
        }}
        className="mt-4 min-h-[48px] w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-cyan-300 [touch-action:manipulation]"
      >
        📸 Open Camera
      </button>
    </div>
  ) : (
    <div className="fixed inset-0 z-[2147483647] h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setVideoSize({
            width: video.videoWidth || 0,
            height: video.videoHeight || 0,
          });
        }}
        className="absolute inset-0 h-full w-full bg-black object-cover"
        style={
          hardwareZoomSupportedRef.current || zoomLevel <= 1
            ? undefined
            : {
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
              }
        }
      />

      <div
        className="absolute inset-0 z-[1]"
        onPointerDown={handleCameraTapFocus}
        aria-label="Tap camera preview to focus"
      />

      {focusPoint && (
        <div
          className="pointer-events-none absolute z-[22] h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-yellow-300 shadow-[0_0_18px_rgba(253,224,71,0.7)]"
          style={{
            left: `${focusPoint.x * 100}%`,
            top: `${focusPoint.y * 100}%`,
          }}
        >
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300" />
        </div>
      )}

      {focusMessage && (
        <div className="pointer-events-none absolute left-1/2 top-[38%] z-[22] -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-black text-yellow-200 backdrop-blur">
          {focusMessage}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/65" />

      {displayedRegionSuggestions
        .filter((suggestion) => suggestion.region)
        .slice(0, 1)
        .map((suggestion, index) => {
          const region = suggestion.region!;
          return (
            <button
              key={`camera-region-${suggestion.trackId || createSuggestionKey(suggestion)}-${index}`}
              type="button"
              onClick={() => {
                setActiveRegionSuggestions((current) =>
                  toggleTrackedDetectionPin(current, suggestion.trackId),
                );
                setDetailsOpen(true);
              }}
              className={`absolute z-10 border-[3px] bg-emerald-400/10 transition-all duration-500 ease-out ${
                suggestion.stale
                  ? "border-emerald-300/55 opacity-60"
                  : "border-emerald-400 opacity-100 shadow-[0_0_24px_rgba(74,222,128,0.8)] animate-[pulse_2.8s_ease-in-out_infinite]"
              } ${region.approximate ? "border-dashed" : ""} ${
                suggestion.pinned ? "ring-2 ring-cyan-300" : ""
              }`}
              style={mapRegionToObjectCover(
                region,
                videoSize.width,
                videoSize.height,
                viewportSize.width,
                viewportSize.height,
                zoomLevel,
                hardwareZoomSupportedRef.current,
              )}
            >
              <span className="absolute left-1/2 top-0 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-full border border-emerald-400/50 bg-black/88 px-3 py-1.5 text-[11px] font-black text-emerald-300 shadow-xl backdrop-blur">
                {region.label || suggestion.title}
                <span className="ml-2 text-emerald-100">
                  {confidenceLabel(suggestion.confidence)}
                  {suggestion.pinned ? " · pinned" : ""}
                </span>
              </span>
            </button>
          );
        })}

      <div
        className="absolute left-0 right-0 top-0 z-20"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (
                pendingEvidenceCapture &&
                !window.confirm(
                  "A finding or limitation is waiting for its required photo. Close the camera and cancel it?",
                )
              ) {
                return;
              }

              setPendingEvidenceCapture(null);
              setOpen(false);
            }}
            aria-label="Close camera"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/70 text-4xl font-light text-white shadow-2xl backdrop-blur active:scale-95"
          >
            ×
          </button>

          <button
            type="button"
            onClick={() => setAutoWatch((current) => !current)}
            disabled={!online || starting}
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm font-black text-white shadow-2xl backdrop-blur disabled:opacity-50"
          >
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                autoWatch ? "bg-teal-400" : "bg-slate-500"
              }`}
            />
            <span>{autoWatch ? "AI Watching" : "AI Paused"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTorch}
            aria-label="Toggle flash"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/70 text-2xl shadow-2xl backdrop-blur active:scale-95 ${
              torchOn ? "ring-2 ring-yellow-300" : ""
            }`}
          >
            ⚡
          </button>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => {
              setCockpitView("coach");
              setDetailsOpen(true);
            }}
            className="inline-flex min-h-12 shrink-0 items-center gap-3 rounded-full border border-teal-400/45 bg-black/70 px-4 py-2 text-sm font-black text-white shadow-2xl backdrop-blur"
          >
            <span className="text-teal-300">Coach</span>
            <span>{coachMemoryCount}</span>
            <span>📋</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setCockpitView("queue");
          setDetailsOpen(true);
        }}
        className="absolute left-4 top-[8.5rem] z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm font-black text-white shadow-xl backdrop-blur"
      >
        <span>🧠</span>
        <span>{pendingCount}</span>
      </button>

      <button
        type="button"
        onClick={toggleFacingCamera}
        className="absolute left-4 top-[15.5rem] z-20 flex h-14 w-14 flex-col items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl backdrop-blur active:scale-95"
      >
        <span className="text-lg">↻</span>
        <span className="text-[11px] font-bold">Flip</span>
      </button>

      <div className="absolute right-3 top-[21%] z-20 flex h-[38%] w-11 flex-col items-center">
        <div className="rounded-full bg-black/75 px-3 py-2 text-sm font-bold backdrop-blur">
          {zoomLevel.toFixed(1)}x
        </div>
        <input
          type="range"
          min={zoomMin}
          max={zoomMax}
          step={0.1}
          value={zoomLevel}
          onChange={(event) =>
            void handleZoomChange(Number(event.target.value))
          }
          aria-label="Camera zoom"
          className="mt-3 h-full w-8 cursor-pointer accent-white [appearance:slider-vertical]"
          style={{ writingMode: "vertical-lr", direction: "rtl" }}
        />
      </div>

      {analyzing && (
        <div className="absolute left-1/2 top-[46%] z-20 -translate-x-1/2 rounded-full border border-purple-300/40 bg-black/75 px-5 py-3 text-sm font-black text-purple-200 shadow-2xl backdrop-blur">
          ✨ AI analyzing this area…
        </div>
      )}

      {evidenceChecking && (
        <div className="absolute left-1/2 top-[46%] z-30 -translate-x-1/2 rounded-full border border-cyan-300/50 bg-black/85 px-5 py-3 text-sm font-black text-cyan-100 shadow-2xl backdrop-blur">
          🔎 Checking evidence quality…
        </div>
      )}

      {pendingEvidenceReview && (
        <div className="absolute inset-x-3 bottom-[7.5rem] z-40 mx-auto max-w-[680px] rounded-2xl border border-amber-300/60 bg-[#07111f]/98 p-4 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/15 text-xl">
              ⚠
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                Evidence Needs Review
              </p>
              <p className="mt-1 truncate text-sm font-black text-white">
                {pendingEvidenceReview.title}
              </p>
              <p className="mt-2 text-sm leading-5 text-slate-200">
                {pendingEvidenceReview.review.guidance}
              </p>

              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                <span className="rounded-lg border border-white/10 bg-black/25 px-1 py-2">
                  Focus<br />
                  {pendingEvidenceReview.review.sharpness}
                </span>
                <span className="rounded-lg border border-white/10 bg-black/25 px-1 py-2">
                  Light<br />
                  {pendingEvidenceReview.review.lighting}
                </span>
                <span className="rounded-lg border border-white/10 bg-black/25 px-1 py-2">
                  Frame<br />
                  {pendingEvidenceReview.review.framing}
                </span>
                <span className="rounded-lg border border-white/10 bg-black/25 px-1 py-2">
                  Score<br />
                  {pendingEvidenceReview.review.overallScore}%
                </span>
              </div>

              {pendingEvidenceReview.review.missingElements.length > 0 && (
                <p className="mt-3 text-xs font-bold text-amber-100">
                  Missing:{" "}
                  {pendingEvidenceReview.review.missingElements.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retakePendingEvidence}
              className="min-h-12 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-black active:scale-[0.98]"
            >
              Retake Photo
            </button>
            <button
              type="button"
              onClick={() => void acceptPendingEvidenceAnyway()}
              className="min-h-12 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
            >
              Use Anyway
            </button>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{
          paddingLeft: "14px",
          paddingRight: "14px",
          paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))",
        }}
      >
        {pendingEvidenceCapture && (
          <div className="mx-auto mb-3 flex max-w-[680px] items-center gap-3 rounded-2xl border border-amber-300/55 bg-black/88 px-3 py-2 shadow-2xl backdrop-blur-2xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/15 text-lg">
              📸
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">
                Photo Required
              </p>
              <p className="truncate text-sm font-black text-white">
                {pendingEvidenceCapture.kind === "finding"
                  ? pendingEvidenceCapture.suggestion.title
                  : pendingEvidenceCapture.limitation.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingEvidenceCapture(null);
                setMessage(
                  "Required photo capture canceled. Nothing was added.",
                );
              }}
              className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-black text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {!pendingEvidenceCapture &&
          liveNoticeVisible &&
          (primarySuggestion || primaryReminder) && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="mx-auto mb-3 flex min-h-[48px] w-full max-w-[680px] items-center gap-3 rounded-2xl border border-white/15 bg-black/78 px-3 py-2 text-left shadow-2xl backdrop-blur-2xl active:scale-[0.99]"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base ${
                  primaryReminder
                    ? "border-blue-400/50 bg-blue-500/20"
                    : "border-teal-400/50 bg-teal-500/20"
                }`}
              >
                {primaryReminder ? "📋" : "✨"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
                {primaryReminder
                  ? primaryReminder.detail || primaryReminder.title
                  : primarySuggestion?.observation || primarySuggestion?.title}
              </span>
              <span className="shrink-0 text-lg text-teal-200">›</span>
            </button>
          )}

        <div className="mx-auto mb-3 flex max-w-[680px] items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/72 px-3 py-2 shadow-xl backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
              Saving To
            </p>
            <p className="truncate text-sm font-black text-white">
              {destinationLabel}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-black text-white">
            {selectedMediaCount} selected
          </span>
        </div>

        <div className="mx-auto mb-2 grid max-w-[260px] grid-cols-2 rounded-full border border-white/15 bg-black/70 p-1 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => {
              if (!recordingVideo) setCaptureMode("photo");
            }}
            disabled={recordingVideo}
            className={`rounded-full px-5 py-2 text-xs font-black transition ${
              captureMode === "photo" ? "bg-white text-black" : "text-white"
            } disabled:opacity-40`}
          >
            PHOTO
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode("video")}
            className={`rounded-full px-5 py-2 text-xs font-black transition ${
              captureMode === "video" ? "bg-red-500 text-white" : "text-white"
            }`}
          >
            VIDEO
          </button>
        </div>

        <div
          className="mx-auto max-w-[680px]"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setCockpitView("queue");
              setDetailsOpen(true);
            }}
            className="flex min-h-[72px] min-w-0 flex-1 flex-col items-center justify-end rounded-2xl pb-1 text-center active:bg-white/10"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-black/55 text-xl shadow-xl backdrop-blur">
              🖼️
            </span>
            <span className="mt-1 text-xs font-bold text-white">Review</span>
          </button>

          <button
            type="button"
            onClick={() => void handlePrimaryCapture()}
            disabled={starting || evidenceChecking || Boolean(pendingEvidenceReview)}
            aria-label={
              captureMode === "video"
                ? recordingVideo
                  ? "Stop recording"
                  : "Start recording"
                : "Take photo"
            }
            className={`mb-1 h-[82px] w-[82px] shrink-0 rounded-full border-[5px] shadow-2xl active:scale-95 disabled:opacity-50 ${
              captureMode === "video"
                ? recordingVideo
                  ? "border-white bg-red-600 ring-4 ring-red-400 animate-pulse"
                  : "border-white bg-red-500 ring-4 ring-red-400"
                : pendingEvidenceCapture
                  ? "border-white bg-white ring-4 ring-amber-300 animate-pulse"
                  : "border-white bg-white ring-4 ring-teal-400"
            }`}
          >
            {captureMode === "video" && recordingVideo && (
              <span className="mx-auto block h-7 w-7 rounded-md bg-white" />
            )}
          </button>

          <button
            type="button"
            onClick={analyzeCurrentFrame}
            disabled={starting || analyzing || !online || recordingVideo}
            className="flex min-h-[72px] min-w-0 flex-1 flex-col items-center justify-end rounded-2xl pb-1 text-center active:bg-white/10 disabled:opacity-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-black/55 text-xl shadow-xl backdrop-blur">
              ✨
            </span>
            <span className="mt-1 text-xs font-bold text-white">
              {analyzing ? "Working" : "Analyze"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            className="flex min-h-[72px] min-w-0 flex-1 flex-col items-center justify-end rounded-2xl pb-1 text-center active:bg-white/10"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-black/55 text-2xl leading-none shadow-xl backdrop-blur">
              •••
            </span>
            <span className="mt-1 text-xs font-bold text-white">More</span>
          </button>
        </div>
      </div>

      {(actionsOpen || detailsOpen || cameraError) && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-black/45"
          onClick={() => {
            setActionsOpen(false);
            setDetailsOpen(false);
            setMessage("");
          }}
        >
          <div
            className="flex h-[76dvh] w-full flex-col overflow-hidden rounded-t-[2rem] border-t border-white/20 bg-[#06101f]/98 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30" />

            {cameraError && (
              <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm font-bold text-red-200">
                {cameraError}
              </div>
            )}

            {message && (
              <div className="mb-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm font-bold text-cyan-100">
                {message}
              </div>
            )}

            {actionsOpen && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-cyan-100">
                        AI scan interval
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Analyze the live camera every {scanIntervalSeconds}{" "}
                        seconds.
                      </p>
                    </div>
                    <span className="rounded-full bg-cyan-400 px-3 py-1 text-sm font-black text-black">
                      {scanIntervalSeconds}s
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">
                    Safety and repair concerns interrupt the camera.
                    Maintenance, documentation, Digital Twin context, and
                    lower-priority guidance are stored quietly in Live Memory.
                  </p>

                  <div className="mt-4 grid grid-cols-6 gap-2">
                    {LIVE_SCAN_INTERVAL_OPTIONS.map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => setScanIntervalSeconds(seconds)}
                        className={`rounded-xl border px-2 py-2 text-xs font-black ${
                          scanIntervalSeconds === seconds
                            ? "border-cyan-300 bg-cyan-400 text-black"
                            : "border-slate-600 bg-slate-900 text-slate-200"
                        }`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => captureFrame()}
                    className="rounded-2xl border border-slate-600 bg-slate-900 p-4 font-black"
                  >
                    Capture Frame
                  </button>
                  <button
                    type="button"
                    onClick={addPhotoOnly}
                    className="rounded-2xl border border-teal-500 bg-teal-500/10 p-4 font-black text-teal-200"
                  >
                    Add Photo Only
                  </button>
                  <button
                    type="button"
                    onClick={analyzeCurrentFrame}
                    disabled={!online || analyzing}
                    className="rounded-2xl border border-purple-500 bg-purple-500/10 p-4 font-black text-purple-200 disabled:opacity-50"
                  >
                    Analyze Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveSelectedMediaToGallery(frameFile);
                      onScanDataPlate(frameFile);
                    }}
                    className="rounded-2xl border border-yellow-500 bg-yellow-500/10 p-4 font-black text-yellow-200"
                  >
                    Scan Data Plate
                  </button>
                </div>
              </div>
            )}

            {detailsOpen && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 rounded-2xl border border-cyan-400/30 bg-[#06101f]/98 p-3 shadow-2xl backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                        Live Inspection Cockpit
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-white">
                        {currentSection || "Inspection"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(false)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-2xl text-white active:scale-95"
                      aria-label="Close cockpit"
                    >
                      ×
                    </button>
                  </div>

                  <div
                    className="mt-3 gap-1.5"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                    }}
                  >
                    {[
                      ["queue", "🧠", String(pendingCount)],
                      ["coach", "📋", String(coachMemoryCount)],
                      ["score", "✓", "Score"],
                      ["timeline", "◷", "Activity"],
                      ["house", "⌂", "House"],
                      ["voice", "🎙️", "Voice"],
                    ].map(([view, icon, label]) => {
                      const active = cockpitView === view;

                      return (
                        <button
                          key={view}
                          type="button"
                          onClick={() =>
                            setCockpitView(view as typeof cockpitView)
                          }
                          className={`min-w-0 rounded-xl border px-1 py-2 text-center text-[9px] font-black transition active:scale-[0.96] ${
                            active
                              ? "border-cyan-200 bg-cyan-400 text-black shadow-[0_0_18px_rgba(34,211,238,0.42)]"
                              : "border-white/10 bg-black/35 text-slate-300"
                          }`}
                        >
                          <span className="block text-base leading-none">
                            {icon}
                          </span>
                          <span className="mt-1 block truncate">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                  {cockpitView === "coach" && (
                    <LiveSectionCoach
                      inspectionId={selectedReport}
                      section={currentSection}
                      online={online}
                      compact
                    />
                  )}

                  {cockpitView === "score" && (
                    <LiveInspectionScore
                      inspectionId={selectedReport}
                      section={currentSection}
                      online={online}
                      compact
                    />
                  )}

                  {cockpitView === "timeline" && (
                    <LiveInspectionTimelinePanel
                      inspectionId={selectedReport}
                    />
                  )}

                  {cockpitView === "house" && (
                    <LiveHouseIntelligencePanel inspectionId={selectedReport} />
                  )}

                  {cockpitView === "voice" && (
                    <VoiceFindingGenerator
                      reportId={selectedReport}
                      currentSection={currentSection}
                      currentSeverity={currentSeverity}
                      compact
                      onCaptureCurrentFrame={() => {
                        void quickAddPhoto();
                      }}
                    />
                  )}

                  {cockpitView === "queue" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-amber-400/30 bg-[#06101f]/95 p-4 shadow-xl backdrop-blur">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">
                              Everything AI Has Found
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              Tap any item to expand it and work it immediately.
                            </p>
                          </div>
                          <span className="rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-black">
                            {activeMemoryItems.length}
                          </span>
                        </div>
                      </div>

                      {activeMemoryItems.length > 0 && (
                        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">
                              Active Queue · Tap To Work
                            </p>
                            <span className="rounded-full bg-amber-300 px-2.5 py-1 text-xs font-black text-black">
                              {activeMemoryItems.length}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {activeMemoryItems.map((item) => {
                              const expanded = selectedMemoryKey === item.key;

                              return (
                                <div
                                  key={`memory-detail-${item.key}`}
                                  className={`overflow-hidden rounded-xl border transition ${
                                    expanded
                                      ? "border-teal-300 bg-teal-400/10 shadow-lg"
                                      : "border-white/10 bg-black/30"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedMemoryKey((current) =>
                                        current === item.key ? "" : item.key,
                                      )
                                    }
                                    className="w-full p-3 text-left active:bg-white/5"
                                  >
                                    <div className="flex items-start gap-3">
                                      <span
                                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                          item.kind === "suggestion"
                                            ? "bg-red-400"
                                            : item.kind === "reminder"
                                              ? "bg-cyan-300"
                                              : item.kind === "limitation"
                                                ? "bg-yellow-300"
                                                : "bg-purple-300"
                                        }`}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-white">
                                          {item.title}
                                        </p>
                                        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                          {formatMemoryTime(
                                            item.updatedAt || item.createdAt,
                                          )}
                                          {" · "}
                                          {item.kind.replace("_", " ")}
                                          {item.confidence
                                            ? ` · ${confidenceLabel(item.confidence)}`
                                            : ""}
                                          {item.status === "snoozed"
                                            ? " · snoozed"
                                            : ""}
                                        </p>
                                      </div>
                                      <span className="text-xl text-slate-400">
                                        {expanded ? "⌃" : "⌄"}
                                      </span>
                                    </div>
                                  </button>

                                  {expanded && (
                                    <div className="border-t border-white/10 px-3 pb-3 pt-3">
                                      {item.suggestion && (
                                        <>
                                          <p className="text-sm leading-6 text-slate-200">
                                            {item.suggestion.observation}
                                          </p>

                                          {item.suggestion.implication && (
                                            <p className="mt-2 text-sm leading-6 text-slate-300">
                                              <strong>Implication:</strong>{" "}
                                              {item.suggestion.implication}
                                            </p>
                                          )}

                                          {item.suggestion.recommendation && (
                                            <p className="mt-2 text-sm leading-6 text-slate-300">
                                              <strong>Recommendation:</strong>{" "}
                                              {item.suggestion.recommendation}
                                            </p>
                                          )}

                                          <div className="mt-4 grid grid-cols-3 gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                ignoreSuggestion(
                                                  item.suggestion!,
                                                )
                                              }
                                              className="rounded-xl border border-slate-600 px-2 py-3 text-xs font-black"
                                            >
                                              Ignore
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                snoozeSuggestion(
                                                  item.suggestion!,
                                                )
                                              }
                                              className="rounded-xl border border-yellow-500/60 px-2 py-3 text-xs font-black text-yellow-200"
                                            >
                                              Remind Later
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                beginSuggestionEvidenceCapture(
                                                  item.suggestion!,
                                                )
                                              }
                                              className="rounded-xl bg-emerald-400 px-2 py-3 text-xs font-black text-black"
                                            >
                                              Add + Photo
                                            </button>
                                          </div>
                                        </>
                                      )}

                                      {item.limitation && (
                                        <>
                                          <p className="whitespace-pre-line text-sm leading-6 text-slate-200">
                                            {createLimitationText(
                                              item.limitation,
                                            )}
                                          </p>

                                          <div className="mt-4 grid grid-cols-2 gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                updateLiveMemoryItem(item.key, {
                                                  status: "ignored",
                                                });
                                                setSelectedMemoryKey("");
                                                setMessage(
                                                  "Limitation ignored and moved to History.",
                                                );
                                              }}
                                              className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black"
                                            >
                                              Ignore
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                beginLimitationEvidenceCapture(
                                                  item.limitation!,
                                                  0,
                                                )
                                              }
                                              className="rounded-xl bg-orange-400 px-3 py-3 text-xs font-black text-black"
                                            >
                                              Add + Photo
                                            </button>
                                          </div>
                                        </>
                                      )}

                                      {item.reminder && (
                                        <>
                                          {item.reminder.detail && (
                                            <p className="text-sm leading-6 text-slate-200">
                                              {item.reminder.detail}
                                            </p>
                                          )}

                                          <div className="mt-4 grid grid-cols-3 gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                ignoreReminder(item.reminder!)
                                              }
                                              className="rounded-xl border border-slate-600 px-2 py-3 text-xs font-black"
                                            >
                                              Ignore
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                saveReminderPhoto(
                                                  item.reminder!,
                                                )
                                              }
                                              className="rounded-xl border border-cyan-500/70 px-2 py-3 text-xs font-black text-cyan-100"
                                            >
                                              Add Photo
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                markReminderChecked(
                                                  item.reminder!,
                                                )
                                              }
                                              className="rounded-xl bg-emerald-400 px-2 py-3 text-xs font-black text-black"
                                            >
                                              Complete
                                            </button>
                                          </div>
                                        </>
                                      )}

                                      {item.kind === "data_plate" && (
                                        <div className="grid grid-cols-2 gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              updateLiveMemoryItem(item.key, {
                                                status: "ignored",
                                              });
                                              setSelectedMemoryKey("");
                                              setMessage(
                                                "Data plate reminder ignored and moved to History.",
                                              );
                                            }}
                                            className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black"
                                          >
                                            Ignore
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              onScanDataPlate(frameFile);
                                              updateLiveMemoryItem(item.key, {
                                                status: "completed",
                                              });
                                              setSelectedMemoryKey("");
                                            }}
                                            className="rounded-xl bg-yellow-400 px-3 py-3 text-xs font-black text-black"
                                          >
                                            Scan Plate
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {memoryHistoryItems.length > 0 && (
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                          <button
                            type="button"
                            onClick={() =>
                              setMemoryHistoryOpen((current) => !current)
                            }
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-300">
                                History
                              </p>
                              <p className="mt-1 text-sm text-slate-400">
                                Completed and ignored items
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-black">
                              {memoryHistoryItems.length}{" "}
                              {memoryHistoryOpen ? "⌃" : "⌄"}
                            </span>
                          </button>

                          {memoryHistoryOpen && (
                            <div className="mt-3 space-y-2">
                              {memoryHistoryItems.map((item) => (
                                <div
                                  key={`memory-history-${item.key}`}
                                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/25 p-3"
                                >
                                  <span
                                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                      item.status === "completed"
                                        ? "bg-emerald-400"
                                        : "bg-slate-500"
                                    }`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-white">
                                      {item.title}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                      {item.status}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateLiveMemoryItem(item.key, {
                                        status: "active",
                                      })
                                    }
                                    className="rounded-lg border border-slate-600 px-2 py-1 text-[10px] font-black"
                                  >
                                    Reopen
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {visibleSuggestions.map((suggestion, index) => (
                        <div
                          key={`${createSuggestionKey(suggestion)}-${index}`}
                          className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.15em] text-purple-300">
                                AI Suggestion
                              </p>
                              <h3 className="mt-1 text-lg font-black">
                                {suggestion.title}
                              </h3>
                            </div>
                            <span className="rounded-full border border-purple-400/40 px-2 py-1 text-xs font-black text-purple-200">
                              {confidenceLabel(suggestion.confidence)}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-200">
                            {suggestion.observation}
                          </p>

                          {suggestion.implication && (
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                              <strong>Implication:</strong>{" "}
                              {suggestion.implication}
                            </p>
                          )}

                          {suggestion.recommendation && (
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                              <strong>Recommendation:</strong>{" "}
                              {suggestion.recommendation}
                            </p>
                          )}

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => ignoreSuggestion(suggestion)}
                              className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black"
                            >
                              Ignore
                            </button>
                            <button
                              type="button"
                              onClick={() => snoozeSuggestion(suggestion)}
                              className="rounded-xl border border-yellow-500/60 px-3 py-3 text-xs font-black text-yellow-200"
                            >
                              Remind (5m)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                beginSuggestionEvidenceCapture(suggestion)
                              }
                              className="rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-black"
                            >
                              Add Finding + Photo
                            </button>
                          </div>
                        </div>
                      ))}

                      {visibleReminders.map((reminder, index) => (
                        <div
                          key={`${createReminderKey(reminder)}-${index}`}
                          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-300">
                            Section Coach
                          </p>
                          <h3 className="mt-1 text-lg font-black">
                            {reminder.title}
                          </h3>
                          {reminder.detail && (
                            <p className="mt-2 text-sm leading-6 text-slate-200">
                              {reminder.detail}
                            </p>
                          )}
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => ignoreReminder(reminder)}
                              className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black"
                            >
                              Ignore
                            </button>
                            <button
                              type="button"
                              onClick={() => saveReminderPhoto(reminder)}
                              className="rounded-xl border border-cyan-500/70 px-3 py-3 text-xs font-black text-cyan-100"
                            >
                              Add Photo
                            </button>
                            <button
                              type="button"
                              onClick={() => markReminderChecked(reminder)}
                              className="rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-black"
                            >
                              Mark Checked
                            </button>
                          </div>
                        </div>
                      ))}

                      {(result?.limitations || []).map((limitation, index) => (
                        <div
                          key={`${limitation.title}-${index}`}
                          className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.15em] text-orange-300">
                            Possible Limitation
                          </p>
                          <h3 className="mt-1 text-lg font-black">
                            {limitation.title}
                          </h3>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">
                            {createLimitationText(limitation)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              beginLimitationEvidenceCapture(limitation, index)
                            }
                            disabled={savingLimitationIndex !== null}
                            className="mt-4 w-full rounded-xl bg-orange-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50"
                          >
                            {savingLimitationIndex === index
                              ? "Adding..."
                              : "Add Limitation + Photo"}
                          </button>
                        </div>
                      ))}

                      {!pendingCount && (
                        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center text-sm text-slate-300">
                          AI is watching. No pending suggestions right now.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
  if (open && typeof document !== "undefined") {
    return createPortal(cameraUi, document.body);
  }

  return cameraUi;
}
