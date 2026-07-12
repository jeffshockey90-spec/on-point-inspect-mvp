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

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
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

    const interval = window.setInterval(() => {
      const now = Date.now();

      if (autoScanRunningRef.current) return;
      if (analyzing || starting) return;
      if (now - lastAutoScanAt < 7500) return;

      void autoAnalyzeFrame();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [open, autoWatch, online, selectedReport, analyzing, starting, lastAutoScanAt]);

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

  async function startCamera() {
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
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

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

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    latestFrameRef.current = dataUrl;
    setFrameDataUrl(dataUrl);
    if (!options.silent) {
      setMessage("Frame captured. Review, analyze, or add it as a photo.");
    }
    return dataUrl;
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
    if (!selectedReport || !online || autoScanRunningRef.current || waitingForDecision) return;

    const hasPendingReview =
      result &&
      ((result.suggestions || []).length > 0 ||
        (result.limitations || []).length > 0 ||
        (result.reminders || []).length > 0 ||
        result.dataPlatePrompt?.needed);

    if (hasPendingReview) {
      setMessage(
        "AI prompt waiting for review. Choose an action or Ignore to continue scanning.",
      );
      return;
    }

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
          confidence >= 0.78 ||
          severityText.includes("safety") ||
          severityText.includes("major") ||
          typeText.includes("safety")
        );
      });

      const strongLimitations = limitations.filter(
        (item: any) => normalizeConfidence(item?.confidence) >= 0.8,
      );

      const highPriorityReminders = reminders.filter(
        (item: any) => String(item?.priority || "").toLowerCase() === "high",
      );

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
      setResult({
        ...data,
        suggestions: strongSuggestions.length > 0 ? strongSuggestions : suggestions,
        limitations: strongLimitations.length > 0 ? strongLimitations : limitations,
        reminders: highPriorityReminders.length > 0 ? highPriorityReminders : reminders,
      });

      setWaitingForDecision(true);

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

  const cameraUi = (
    <div
      className={
        open
          ? "fixed inset-0 z-[2147483647] flex h-[100dvh] w-[100vw] flex-col overflow-hidden bg-[#020617] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] text-white sm:relative sm:inset-auto sm:z-auto sm:h-auto sm:w-auto sm:overflow-visible sm:rounded-2xl sm:border sm:border-cyan-500/40 sm:bg-cyan-500/10 sm:p-4"
          : "rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white"
      }
    >
      <div className="mb-2 grid shrink-0 gap-2 sm:mb-3 sm:flex sm:items-start sm:justify-between sm:gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
            AI Live Inspection Camera
          </p>
          <h2 className="mt-1 text-lg font-black sm:hidden">AI Second Inspector</h2>
          <h2 className="mt-1 hidden text-xl font-black sm:block">AI Second Inspector Camera</h2>
          <p className="mt-1 hidden text-sm text-slate-300 sm:block">
            Suggestions only. Inspector approval is required before anything is saved.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          {open && (
            <button
              type="button"
              onClick={() => setAutoWatch((current) => !current)}
              disabled={!online || starting}
              className={`min-h-[44px] w-full rounded-xl px-2 py-2 text-[11px] font-black transition sm:w-auto sm:px-4 sm:text-sm active:scale-[0.98] disabled:opacity-50 [touch-action:manipulation] ${
                autoWatch
                  ? "bg-emerald-400 text-black hover:bg-emerald-300"
                  : "border border-emerald-400 text-emerald-200 hover:bg-emerald-500 hover:text-black"
              }`}
            >
              {autoWatch ? "👀 AI Watching: ON" : "👀 AI Watching: OFF"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (open) {
                setOpen(false);
                return;
              }

              setAutoWatch(online);
              setOpen(true);
              window.setTimeout(startCamera, 50);
            }}
            className="min-h-[44px] w-full rounded-xl bg-cyan-400 px-2 py-2 text-[11px] font-black text-black transition sm:w-auto sm:px-4 sm:text-sm active:scale-[0.98] hover:bg-cyan-300 [touch-action:manipulation]"
          >
            {open ? "Close Camera" : "📸 Open AI Camera"}
          </button>
        </div>
      </div>

      {open && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-32 sm:space-y-4 sm:overflow-visible sm:pb-0">
          <div className="shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-[48dvh] min-h-[280px] max-h-[58dvh] w-full bg-black object-cover sm:aspect-video sm:h-auto sm:min-h-0 sm:max-h-none"
              />

              {visibleSuggestions
                .filter((suggestion) => suggestion.region)
                .slice(0, 6)
                .map((suggestion, index) => {
                  const region = suggestion.region!;
                  return (
                    <div
                      key={`live-region-${createSuggestionKey(suggestion)}-${index}`}
                      className="pointer-events-none absolute border-2 border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_0_1px_rgba(0,0,0,0.8)]"
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.width * 100}%`,
                        height: `${region.height * 100}%`,
                      }}
                    >
                      <span className="absolute left-0 top-0 max-w-[180px] truncate rounded-br bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                        {region.label || suggestion.title}
                      </span>
                    </div>
                  );
                })}
            </div>

            {frameDataUrl && (
              <div className="border-t border-slate-800 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Captured Frame
                </p>
                <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl">
                  <img
                    src={frameDataUrl}
                    alt="Captured inspection frame"
                    className="max-h-40 w-full rounded-xl object-contain sm:max-h-52"
                  />
                  {visibleSuggestions
                    .filter((suggestion) => suggestion.region)
                    .slice(0, 6)
                    .map((suggestion, index) => {
                      const region = suggestion.region!;
                      return (
                        <div
                          key={`region-${createSuggestionKey(suggestion)}-${index}`}
                          className="pointer-events-none absolute border-2 border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_0_1px_rgba(0,0,0,0.8)]"
                          style={{
                            left: `${region.x * 100}%`,
                            top: `${region.y * 100}%`,
                            width: `${region.width * 100}%`,
                            height: `${region.height * 100}%`,
                          }}
                        >
                          <span className="absolute left-0 top-0 max-w-[180px] -translate-y-full truncate rounded-t bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                            {region.label || suggestion.title}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm font-bold text-red-200">
              {cameraError}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-cyan-500/40 bg-black/30 px-3 py-2 text-xs font-bold text-cyan-100 sm:p-3 sm:text-sm">
              {message}
            </div>
          )}

          {autoWatch && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 sm:p-3 sm:text-sm">
              👀 AI Watching is active. The camera will quietly check this area about every 8 seconds and only interrupt for stronger issues, limitations, reminders, or data plate prompts.
            </div>
          )}

          <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-[#020617]/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur sm:static sm:grid-cols-3 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none lg:grid-cols-6">
            <button
              type="button"
              onClick={() => captureFrame()}
              disabled={starting || recordingVideo}
              className="rounded-xl border border-slate-600 px-3 py-2.5 text-sm font-black text-slate-100 transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-50"
            >
              Capture Frame
            </button>

            <button
              type="button"
              onClick={quickAddPhoto}
              disabled={starting || recordingVideo}
              className="rounded-xl bg-teal-400 px-3 py-2.5 text-sm font-black text-black transition active:scale-[0.98] hover:bg-teal-300 disabled:opacity-50"
            >
              Quick Photo
            </button>

            <button
              type="button"
              onClick={toggleVideoRecording}
              disabled={starting}
              className={`rounded-xl px-3 py-2.5 text-sm font-black transition active:scale-[0.98] disabled:opacity-50 ${
                recordingVideo
                  ? "bg-red-500 text-white hover:bg-red-400"
                  : "border border-red-500 text-red-200 hover:bg-red-500 hover:text-white"
              }`}
            >
              {recordingVideo ? "Stop Video" : "Record Video"}
            </button>

            <button
              type="button"
              onClick={analyzeCurrentFrame}
              disabled={starting || analyzing || !online}
              className="rounded-xl bg-purple-500 px-3 py-2.5 text-sm font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Frame"}
            </button>

            <button
              type="button"
              onClick={addPhotoOnly}
              disabled={!frameDataUrl}
              className="rounded-xl border border-teal-500 px-3 py-2.5 text-sm font-black text-teal-200 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black disabled:opacity-50"
            >
              Add Photo Only
            </button>

            <button
              type="button"
              onClick={() => { onScanDataPlate(frameFile); setResult(null); setWaitingForDecision(false); setMessage("Data plate sent to scanner. AI Watching resumed."); }}
              disabled={!frameDataUrl}
              className="rounded-xl border border-yellow-500 px-3 py-2.5 text-sm font-black text-yellow-200 transition active:scale-[0.98] hover:bg-yellow-400 hover:text-black disabled:opacity-50"
            >
              Scan Data Plate
            </button>
          </div>

          {result && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-black/30 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Current Area
                </p>
                <h3 className="mt-1 text-lg font-black text-white">
                  {result.area || result.system || "Inspection Area"}
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  Confidence: {confidenceLabel(result.confidence)}
                </p>
                {result.summary && (
                  <p className="mt-2 text-sm leading-6 text-slate-300">{result.summary}</p>
                )}
              </div>

              {result.dataPlatePrompt?.needed && (
                <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
                    Data Plate Needed
                  </p>
                  <h3 className="mt-1 text-base font-black text-yellow-100">
                    {result.dataPlatePrompt.equipmentType || "Equipment"} data plate should be scanned.
                  </h3>
                  <p className="mt-1 text-sm text-yellow-50/90">
                    {result.dataPlatePrompt.reason || "Capture the label before leaving this area."}
                  </p>
                  <button
                    type="button"
                    onClick={() => { onScanDataPlate(frameFile); setResult(null); setWaitingForDecision(false); setMessage("Data plate sent to scanner. AI Watching resumed."); }}
                    className="mt-3 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-black text-black"
                  >
                    Scan Data Plate / Add Frame
                  </button>
                </div>
              )}

              {visibleSuggestions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-purple-300">
                    AI Suggestions Found: {visibleSuggestions.length}
                  </p>

                  {visibleSuggestions.map((suggestion, index) => (
                    <div
                      key={`${createSuggestionKey(suggestion)}-${index}`}
                      className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-white">
                            {suggestion.title || "Possible Finding"}
                          </h3>
                          <p className="mt-1 text-xs font-bold text-purple-200">
                            {suggestion.section} • {suggestion.severity} • {confidenceLabel(suggestion.confidence)}
                          </p>
                        </div>
                        <span className="rounded-full border border-purple-400/50 px-3 py-1 text-xs font-black text-purple-200">
                          {suggestion.suggestionType || "suggestion"}
                        </span>
                      </div>

                      {suggestion.observation && (
                        <p className="mt-3 text-sm leading-6 text-slate-200">
                          {suggestion.observation}
                        </p>
                      )}

                      {Array.isArray(suggestion.evidence) && suggestion.evidence.length > 0 && (
                        <div className="mt-3 rounded-lg border border-slate-700 bg-black/30 p-3 text-xs text-slate-300">
                          <p className="mb-1 font-black text-slate-200">Evidence</p>
                          {suggestion.evidence.slice(0, 3).map((item, itemIndex) => (
                            <p key={itemIndex}>• {item}</p>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => useSuggestion(suggestion)}
                          className="rounded-xl bg-teal-400 px-4 py-2 text-sm font-black text-black"
                        >
                          Add Finding
                        </button>
                        <button
                          type="button"
                          onClick={addPhotoOnly}
                          className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200"
                        >
                          Add Photo Only
                        </button>
                        <button
                          type="button"
                          onClick={() => snoozeSuggestion(suggestion)}
                          className="rounded-xl border border-yellow-500/60 px-4 py-2 text-sm font-black text-yellow-200"
                        >
                          Remind Later
                        </button>
                        <button
                          type="button"
                          onClick={() => ignoreSuggestion(suggestion)}
                          className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-200"
                        >
                          Ignore For Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(result.limitations) && result.limitations.length > 0 && (
                <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                    Limitations Found
                  </p>
                  <p className="mt-1 text-sm text-orange-50/80">
                    AI noticed possible inspection limitations. Inspector must confirm before adding them to the report.
                  </p>

                  <div className="mt-3 space-y-3">
                    {result.limitations.map((limitation, index) => (
                      <div
                        key={`${limitation.title}-${index}`}
                        className="rounded-lg border border-orange-500/30 bg-black/20 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-orange-100">
                              {limitation.title || "Possible Limitation"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-orange-200">
                              {limitation.section || result.area || currentSection} • {confidenceLabel(limitation.confidence)}
                            </p>
                          </div>
                          <span className="rounded-full border border-orange-400/40 px-2 py-0.5 text-[11px] font-black text-orange-200">
                            limitation
                          </span>
                        </div>

                        <p className="mt-2 whitespace-pre-line text-sm leading-5 text-orange-50/85">
                          {createLimitationText(limitation)}
                        </p>

                        {frameDataUrl && (
                          <img
                            src={frameDataUrl}
                            alt="Limitation preview"
                            className="mt-3 max-h-48 w-full rounded-xl border border-orange-500/40 object-contain"
                          />
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => saveLimitationToSection(limitation, index)}
                            disabled={savingLimitationIndex !== null}
                            className="rounded-xl bg-orange-400 px-4 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingLimitationIndex === index
                              ? "Adding..."
                              : "Add To Section Limitations"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResult(null);
                              setWaitingForDecision(false);
                              setMessage("Limitation dismissed. AI Watching resumed.");
                            }}
                            className="rounded-xl border border-orange-500/60 px-4 py-2 text-sm font-black text-orange-100"
                          >
                            Ignore For Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {visibleReminders.length > 0 && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                    Before You Walk Away
                  </p>
                  <div className="mt-3 space-y-2">
                    {visibleReminders.map((reminder, index) => (
                      <div
                        key={`${reminder.title}-${index}`}
                        className="rounded-lg border border-emerald-500/30 bg-black/20 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-emerald-100">□ {reminder.title}</p>
                          {reminder.priority && (
                            <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[11px] font-black text-emerald-200">
                              {reminder.priority}
                            </span>
                          )}
                        </div>
                        {reminder.detail && (
                          <p className="mt-1 text-sm leading-5 text-emerald-50/80">
                            {reminder.detail}
                          </p>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {reminder.action === "scan_data_plate" ? (
                            <button
                              type="button"
                              onClick={() => {
                                onScanDataPlate(frameFile);
                                resolveReminder(reminder, "Data plate sent to scanner. AI Watching can continue when all prompts are handled.");
                              }}
                              className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black"
                            >
                              Scan Data Plate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markReminderChecked(reminder)}
                              className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black"
                            >
                              Mark Checked
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => saveReminderPhoto(reminder)}
                            className="rounded-lg border border-cyan-500/70 px-3 py-2 text-xs font-black text-cyan-100"
                          >
                            Add Photo
                          </button>

                          <button
                            type="button"
                            onClick={() => ignoreReminder(reminder)}
                            className="rounded-lg border border-slate-500/70 px-3 py-2 text-xs font-black text-slate-100"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (open && typeof document !== "undefined") {
    return createPortal(cameraUi, document.body);
  }

  return cameraUi;
}
