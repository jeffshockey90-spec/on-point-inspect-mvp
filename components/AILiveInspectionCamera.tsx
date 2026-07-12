"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  suggestionType?: "defect" | "maintenance" | "documentation" | "safety" | string;
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

type LiveMemoryItem = {
  key: string;
  title: string;
  kind: "suggestion" | "reminder" | "limitation" | "data_plate";
  severity?: string;
  confidence?: number;
  createdAt: number;
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

type Props = {
  online: boolean;
  selectedReport: string;
  currentSection: string;
  currentSeverity: string;
  onUseSuggestion: (suggestion: AILiveSuggestion, frame?: File | null) => void;
  onAddPhotoOnly: (frame: File) => void;
  onScanDataPlate: (frame?: File | null) => void;
};

function createSuggestionKey(suggestion: AILiveSuggestion) {
  return [
    suggestion.section,
    suggestion.severity,
    suggestion.title,
    suggestion.suggestionType,
  ]
    .map((value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
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

  const leftPx = region.x * sourceWidth * scale + offsetX;
  const topPx = region.y * sourceHeight * scale + offsetY;
  const widthPx = region.width * sourceWidth * scale;
  const heightPx = region.height * sourceHeight * scale;

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
    limitation.recommendation ? `Recommendation: ${limitation.recommendation}` : "",
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

export default function AILiveInspectionCamera({
  online,
  selectedReport,
  currentSection,
  currentSeverity,
  onUseSuggestion,
  onAddPhotoOnly,
  onScanDataPlate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const dismissedRef = useRef<Record<string, { confidence: number; at: number }>>({});
  const snoozedRef = useRef<Record<string, { until: number; confidence: number }>>({});
  const autoScanRunningRef = useRef(false);
  const hardwareZoomSupportedRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(3);
  const [liveMemoryItems, setLiveMemoryItems] = useState<LiveMemoryItem[]>([]);
  const [scanIntervalSeconds, setScanIntervalSeconds] = useState(8);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [activeRegionSuggestions, setActiveRegionSuggestions] = useState<
    Array<AILiveSuggestion & { detectedAt: number }>
  >([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoWatch, setAutoWatch] = useState(true);
  const [lastAutoScanAt, setLastAutoScanAt] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [frameDataUrl, setFrameDataUrl] = useState("");
  const latestFrameRef = useRef("");
  const [result, setResult] = useState<AILiveResult | null>(null);
  const [waitingForDecision, setWaitingForDecision] = useState(false);
  const [message, setMessage] = useState("");
  const [savingLimitationIndex, setSavingLimitationIndex] = useState<number | null>(null);
  const [handledReminderKeys, setHandledReminderKeys] = useState<Record<string, boolean>>({});

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
      const parsed = JSON.parse(window.localStorage.getItem(liveMemoryStorageKey) || "[]");
      setLiveMemoryItems(Array.isArray(parsed) ? parsed.slice(0, 20) : []);
    } catch {
      setLiveMemoryItems([]);
    }
  }, [selectedReport, liveMemoryStorageKey]);

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
      })),
      ...(data.reminders || []).map((item) => ({
        key: `reminder:${createReminderKey(item)}`,
        title: item.title,
        kind: "reminder" as const,
        confidence: item.confidence,
        createdAt: now,
      })),
      ...(data.limitations || []).map((item) => ({
        key: `limitation:${String(item.id || item.title).toLowerCase()}`,
        title: item.title,
        kind: "limitation" as const,
        confidence: item.confidence,
        createdAt: now,
      })),
      ...(data.dataPlatePrompt?.needed
        ? [{
            key: `data-plate:${String(data.dataPlatePrompt.equipmentType || data.area || "equipment").toLowerCase()}`,
            title: data.dataPlatePrompt.reason || "Equipment data plate should be captured",
            kind: "data_plate" as const,
            createdAt: now,
          }]
        : []),
    ].filter((item) => item.key && item.title);

    if (!nextItems.length) return;

    setLiveMemoryItems((current) => {
      const merged = [...nextItems, ...current];
      const seen = new Set<string>();
      const unique = merged.filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      }).slice(0, 20);

      try {
        window.localStorage.setItem(liveMemoryStorageKey, JSON.stringify(unique));
      } catch {}

      return unique;
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
      if (snoozed && now < snoozed.until && nextConfidence < snoozed.confidence + RESURFACE_CONFIDENCE_BOOST) {
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
      const cutoff = Date.now() - Math.max(12000, scanIntervalSeconds * 2500);
      setActiveRegionSuggestions((current) =>
        current.filter((item) => item.detectedAt >= cutoff),
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & {
        zoom?: { min?: number; max?: number; step?: number };
      };
      const settings = videoTrack?.getSettings?.() as MediaTrackSettings & { zoom?: number };
      const supportsHardwareZoom = Boolean(capabilities?.zoom?.max && capabilities.zoom.max > 1);
      hardwareZoomSupportedRef.current = supportsHardwareZoom;
      setZoomMin(supportsHardwareZoom ? Math.max(1, Number(capabilities.zoom?.min || 1)) : 1);
      setZoomMax(supportsHardwareZoom ? Math.min(8, Number(capabilities.zoom?.max || 3)) : 3);
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

    const maxWidth = 1100;
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

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    latestFrameRef.current = dataUrl;
    setFrameDataUrl(dataUrl);
    if (!options.silent) {
      setMessage("Frame captured. Review, analyze, or add it as a photo.");
    }
    return dataUrl;
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
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
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

  function quickAddPhoto() {
    const captured = captureFrame({ silent: true });
    if (!captured) return;

    try {
      onAddPhotoOnly(dataUrlToFile(captured, "ai-live-photo"));
      setFrameDataUrl("");
      latestFrameRef.current = "";
      setMessage("Photo added to the Field Tool. Camera remains open for the next capture.");
      recordMemoryEvent({
        eventType: "live_camera_media",
        status: "saved",
        title: "Live camera photo captured",
        detail: `Photo added while inspecting ${currentSection}.`,
        payload: { mediaType: "photo" },
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
      setMessage("Continuous video recording is not supported by this device/browser. Use the Field Tool video picker instead.");
      return;
    }

    try {
      const supportedTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

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
        const file = new File(chunks, `ai-live-video-${Date.now()}.${extension}`, {
          type,
          lastModified: Date.now(),
        });

        onAddPhotoOnly(file);
        setMessage("Video added to the Field Tool. Camera remains open for the next capture.");
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
        setMessage("Video recording failed. Use the Field Tool video picker instead.");
      };

      recorder.start(500);
      setRecordingVideo(true);
      setMessage("Recording video... tap Stop Video when finished. The camera remains open.");
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
      setMessage("AI Live Camera analysis needs internet. You can still capture a photo and save it offline.");
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
      const count = Array.isArray(data.suggestions) ? data.suggestions.length : 0;
      const reminderCount = Array.isArray(data.reminders) ? data.reminders.length : 0;
      const limitationCount = Array.isArray(data.limitations) ? data.limitations.length : 0;
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

      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      const reminders = Array.isArray(data.reminders) ? data.reminders : [];
      const limitations = Array.isArray(data.limitations) ? data.limitations : [];

      const strongSuggestions = suggestions.filter((item: any) => {
        const confidence = normalizeConfidence(item?.confidence);
        const severityText = String(item?.severity || "").toLowerCase();
        const typeText = String(item?.suggestionType || "").toLowerCase();

        return (
          confidence >= 0.55 ||
          severityText.includes("safety") ||
          severityText.includes("major") ||
          typeText.includes("safety") ||
          typeText.includes("documentation")
        );
      });

      const strongLimitations = limitations.filter(
        (item: any) => normalizeConfidence(item?.confidence) >= 0.65,
      );

      const highPriorityReminders = reminders.filter((item: any) => {
        const priority = String(item?.priority || "").toLowerCase();
        return priority === "high" || priority === "medium";
      });

      const shouldInterrupt =
        strongSuggestions.length > 0 ||
        strongLimitations.length > 0 ||
        highPriorityReminders.length > 0 ||
        Boolean(data?.dataPlatePrompt?.needed);

      if (!shouldInterrupt) {
        setMessage("AI watching... no strong issue detected.");
        return;
      }

      setHandledReminderKeys({});
      const liveResult = {
        ...data,
        suggestions: strongSuggestions.length > 0 ? strongSuggestions : suggestions,
        limitations: strongLimitations.length > 0 ? strongLimitations : limitations,
        reminders: highPriorityReminders.length > 0 ? highPriorityReminders : reminders,
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
        setActiveRegionSuggestions((current) => {
          const merged = [...localized, ...current];
          const seen = new Set<string>();

          return merged
            .filter((item) => {
              const key = createSuggestionKey(item);
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 6);
        });
      }

      appendLiveMemory(liveResult);
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

  function useSuggestion(suggestion: AILiveSuggestion) {
    onUseSuggestion(suggestion, frameFile);
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

    setMessage("Suggestion loaded into the Field Tool with the captured frame. Review and tap Save Finding when ready. AI Watching resumed.");
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

    recordMemoryEvent({
      eventType: "live_camera_suggestion",
      status: "remind_later",
      title: suggestion.title,
      detail: suggestion.observation,
      confidence: suggestion.confidence,
      section: suggestion.section || currentSection,
      payload: { snoozedUntil: Date.now() + 5 * 60 * 1000 },
    });

    setResult(null);
    setWaitingForDecision(false);
    setMessage("Reminder snoozed for five minutes. AI Watching resumed.");
  }

  function ignoreSuggestion(suggestion: AILiveSuggestion) {
    recordMemoryEvent({
      eventType: "live_camera_suggestion",
      status: "ignored",
      title: suggestion.title,
      detail: suggestion.observation,
      confidence: suggestion.confidence,
      section: suggestion.section || currentSection,
      payload: { severity: suggestion.severity, suggestionType: suggestion.suggestionType },
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

    setResult(null);
    setWaitingForDecision(false);

    setMessage("Suggestion dismissed. AI Watching resumed.");
  }

  async function saveLimitationToSection(
    limitation: AILiveLimitation,
    index: number,
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
        latestFrameRef.current ||
        frameDataUrl ||
        "";

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

      setResult(null);
      setWaitingForDecision(false);
      setFrameDataUrl("");
      latestFrameRef.current = "";

      setMessage(
        `Limitation added to ${targetSection} with photo. AI Watching resumed.`,
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
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "checked",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: reminder.action, priority: reminder.priority },
    });
    resolveReminder(reminder, "Checklist reminder marked complete. AI Watching can continue when all prompts are handled.");
  }

  function saveReminderPhoto(reminder: AILiveReminder) {
    const captured = frameFile || (captureFrame({ silent: true }) ? dataUrlToFile(latestFrameRef.current) : null);

    if (!captured) {
      setMessage("Capture a frame before adding this reminder photo.");
      return;
    }

    onAddPhotoOnly(captured);
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "saved",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: "photo" },
    });
    resolveReminder(reminder, "Reminder photo saved. AI Watching can continue when all prompts are handled.");
  }

  function ignoreReminder(reminder: AILiveReminder) {
    recordMemoryEvent({
      eventType: "section_coach_item",
      status: "ignored",
      title: reminder.title,
      detail: reminder.detail,
      confidence: reminder.confidence,
      payload: { action: reminder.action },
    });
    resolveReminder(reminder, "Reminder ignored for now. AI Watching can continue when all prompts are handled.");
  }

  function addPhotoOnly() {
    if (!frameFile) {
      const captured = captureFrame();
      if (!captured) return;
      const nextFile = dataUrlToFile(captured);
      onAddPhotoOnly(nextFile);
      setResult(null);
      setWaitingForDecision(false);
      setMessage("Photo saved. AI Watching can continue scanning.");
      return;
    }

    onAddPhotoOnly(frameFile);
    setResult(null);
    setWaitingForDecision(false);
    setMessage("Photo saved. AI Watching can continue scanning.");
  }

  const primarySuggestion = visibleSuggestions[0] || null;
  const primaryReminder = visibleReminders[0] || null;
  const pendingCount = liveMemoryItems.length;

  const cameraUi = !open ? (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
        AI Live Inspection Camera
      </p>
      <h2 className="mt-1 text-xl font-black">AI Second Inspector Camera</h2>
      <p className="mt-1 text-sm text-slate-300">
        Suggestions only. Inspector approval is required before anything is saved.
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
        📸 Open AI Camera
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
            : { transform: `scale(${zoomLevel})`, transformOrigin: "center center" }
        }
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/65" />

      {activeRegionSuggestions
        .filter((suggestion) => suggestion.region)
        .slice(0, 4)
        .map((suggestion, index) => {
          const region = suggestion.region!;
          return (
            <button
              key={`camera-region-${createSuggestionKey(suggestion)}-${index}`}
              type="button"
              onClick={() => setDetailsOpen(true)}
              className={`absolute z-10 border-2 bg-emerald-400/10 shadow-[0_0_18px_rgba(74,222,128,0.45)] ${
                region.approximate
                  ? "border-dashed border-amber-300"
                  : "border-emerald-400"
              }`}
              style={mapRegionToObjectCover(
                region,
                videoSize.width,
                videoSize.height,
                viewportSize.width,
                viewportSize.height,
              )}
            >
              <span className="absolute left-1/2 top-0 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-xl bg-black/85 px-3 py-2 text-xs font-bold text-emerald-300 backdrop-blur">
                {region.approximate ? "Approximate review area: " : ""}
                {region.label || suggestion.title}
              </span>
            </button>
          );
        })}

      <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close camera"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-4xl font-light text-white shadow-2xl backdrop-blur active:scale-95"
        >
          ×
        </button>

        <button
          type="button"
          onClick={() => setAutoWatch((current) => !current)}
          disabled={!online || starting}
          className="min-w-[230px] whitespace-nowrap rounded-2xl border border-white/10 bg-black/80 px-5 py-3 text-center shadow-2xl backdrop-blur-xl disabled:opacity-50"
        >
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-white">
            AI Second Inspector
          </span>
          <span className="mt-1 block text-sm font-bold">
            <span
              className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                autoWatch ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            AI Watching:{" "}
            <span className={autoWatch ? "text-emerald-400" : "text-slate-300"}>
              {autoWatch ? "ON" : "OFF"}
            </span>
          </span>
        </button>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl backdrop-blur active:scale-95 ${
              torchOn ? "ring-2 ring-yellow-300" : ""
            }`}
          >
            <span className="text-xl">⚡</span>
            <span className="text-[9px] font-bold">Flash</span>
          </button>

          <button
            type="button"
            onClick={toggleFacingCamera}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl backdrop-blur active:scale-95"
          >
            <span className="text-lg">↻</span>
            <span className="text-[9px] font-bold">Flip</span>
          </button>
        </div>
      </div>

      <div className="absolute right-4 top-[23%] z-20 flex h-[35%] w-12 flex-col items-center">
        <div className="rounded-full bg-black/75 px-3 py-2 text-sm font-bold backdrop-blur">
          {zoomLevel.toFixed(1)}x
        </div>
        <input
          type="range"
          min={zoomMin}
          max={zoomMax}
          step={0.1}
          value={zoomLevel}
          onChange={(event) => void handleZoomChange(Number(event.target.value))}
          aria-label="Camera zoom"
          className="mt-3 h-full w-8 cursor-pointer accent-white [appearance:slider-vertical]"
          style={{ writingMode: "vertical-lr", direction: "rtl" }}
        />
      </div>

      <div className="absolute bottom-[238px] left-5 z-20 w-[40%] max-w-[280px] space-y-3">
        {primaryReminder && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="w-full rounded-3xl border border-emerald-400/20 bg-black/78 p-4 text-left shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">
                Coach
              </span>
              <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-black">
                {visibleReminders.length}
              </span>
            </div>
            <p className="mt-3 line-clamp-3 text-sm font-bold leading-5">
              {primaryReminder.title}
            </p>
            {primaryReminder.detail && (
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-200">
                {primaryReminder.detail}
              </p>
            )}
          </button>
        )}

        {primarySuggestion && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="w-full rounded-3xl border border-purple-400/20 bg-black/78 p-4 text-left shadow-2xl backdrop-blur-xl"
          >
            <span className="text-xs font-black uppercase tracking-[0.12em] text-purple-300">
              Live Suggestion
            </span>
            <p className="mt-3 line-clamp-3 text-sm font-bold leading-5">
              {primarySuggestion.title}
            </p>
            <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-200">
              {primarySuggestion.observation}
            </p>
          </button>
        )}

        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="w-full rounded-3xl border border-amber-400/20 bg-black/78 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-300">🧠 LIVE MEMORY</span>
            <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] font-black text-amber-200">
              {liveMemoryItems.length}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {liveMemoryItems.slice(0, 4).map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className={`h-2 w-2 shrink-0 rounded-full ${
                  item.kind === "suggestion"
                    ? "bg-red-400"
                    : item.kind === "reminder"
                      ? "bg-cyan-300"
                      : item.kind === "limitation"
                        ? "bg-yellow-300"
                        : "bg-purple-300"
                }`} />
                <span className="truncate">{item.title}</span>
              </div>
            ))}
            {liveMemoryItems.length > 4 && (
              <div className="pl-4 text-[11px] font-bold text-slate-300">
                +{liveMemoryItems.length - 4} more
              </div>
            )}
            {!liveMemoryItems.length && (
              <div className="text-xs text-slate-300">AI is watching for items…</div>
            )}
          </div>
        </button>
      </div>

      {analyzing && (
        <div className="absolute left-1/2 top-[46%] z-20 -translate-x-1/2 rounded-full border border-purple-300/40 bg-black/75 px-5 py-3 text-sm font-black text-purple-200 shadow-2xl backdrop-blur">
          ✨ AI analyzing this area…
        </div>
      )}

      <button
        type="button"
        onClick={quickAddPhoto}
        disabled={starting || recordingVideo}
        aria-label="Take quick photo"
        className="absolute bottom-[116px] left-1/2 z-20 h-20 w-20 -translate-x-1/2 rounded-full border-[6px] border-white bg-white shadow-2xl ring-4 ring-teal-400 active:scale-95 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={() => setActionsOpen(true)}
        className="absolute bottom-[124px] right-5 z-20 rounded-3xl border border-white/15 bg-black/78 px-6 py-4 text-sm font-black tracking-wide shadow-2xl backdrop-blur-xl active:scale-95"
      >
        ACTIONS⌃
      </button>

      <div
        className="absolute bottom-[max(0.7rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 rounded-3xl border border-white/15 bg-black/85 px-2 py-2 shadow-2xl backdrop-blur-xl"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          alignItems: "stretch",
          height: "88px",
        }}
      >
        <button
          type="button"
          onClick={quickAddPhoto}
          disabled={starting || recordingVideo}
          className="rounded-2xl text-center active:bg-white/10 disabled:opacity-50" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">📷</span>
          <span className="mt-1 block text-[11px] font-bold">Quick Photo</span>
        </button>

        <button
          type="button"
          onClick={toggleVideoRecording}
          disabled={starting}
          className={`rounded-2xl text-center active:bg-white/10 disabled:opacity-50 ${
            recordingVideo ? "text-red-300" : ""
          }`}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">{recordingVideo ? "⏹" : "🎥"}</span>
          <span className="mt-1 block text-[11px] font-bold">
            {recordingVideo ? "Stop Video" : "Record Video"}
          </span>
        </button>

        <button
          type="button"
          onClick={analyzeCurrentFrame}
          disabled={starting || analyzing || !online}
          className="rounded-2xl text-center active:bg-white/10 disabled:opacity-50"
        >
          <span className="block text-2xl">✨</span>
          <span className="mt-1 block text-[11px] font-bold">
            {analyzing ? "Analyzing" : "Analyze"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            const captured = frameFile || (() => {
              const dataUrl = captureFrame({ silent: true });
              return dataUrl ? dataUrlToFile(dataUrl) : null;
            })();

            onScanDataPlate(captured);
          }}
          className="rounded-2xl text-center active:bg-white/10" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">▣</span>
          <span className="mt-1 block text-[11px] font-bold">Data Plate</span>
        </button>
      </div>

      {(actionsOpen || detailsOpen || cameraError || message) && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-black/45"
          onClick={() => {
            setActionsOpen(false);
            setDetailsOpen(false);
            setMessage("");
          }}
        >
          <div
            className="max-h-[76dvh] w-full overflow-y-auto rounded-t-[2rem] border-t border-white/20 bg-[#06101f]/98 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
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
                        Analyze the live camera every {scanIntervalSeconds} seconds.
                      </p>
                    </div>
                    <span className="rounded-full bg-cyan-400 px-3 py-1 text-sm font-black text-black">
                      {scanIntervalSeconds}s
                    </span>
                  </div>

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
                  onClick={() => onScanDataPlate(frameFile)}
                  className="rounded-2xl border border-yellow-500 bg-yellow-500/10 p-4 font-black text-yellow-200"
                >
                  Scan Data Plate
                </button>
                </div>
              </div>
            )}

            {detailsOpen && (
              <div className="space-y-4">
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
                        <strong>Implication:</strong> {suggestion.implication}
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
                        onClick={() => useSuggestion(suggestion)}
                        className="rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-black"
                      >
                        Add Finding
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
                    <h3 className="mt-1 text-lg font-black">{reminder.title}</h3>
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
                      onClick={() => saveLimitationToSection(limitation, index)}
                      disabled={savingLimitationIndex !== null}
                      className="mt-4 w-full rounded-xl bg-orange-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50"
                    >
                      {savingLimitationIndex === index
                        ? "Adding..."
                        : "Add To Section Limitations"}
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
  );
  if (open && typeof document !== "undefined") {
    return createPortal(cameraUi, document.body);
  }

  return cameraUi;
}
