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
  handledReminders: Record<string, boolean>,
) {
  if (typeof window === "undefined" || !inspectionId) return;

  try {
    window.localStorage.setItem(
      getLiveMemoryKey(inspectionId),
      JSON.stringify({
        dismissed,
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const dismissedRef = useRef<Record<string, { confidence: number; at: number }>>({});
  const autoScanRunningRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [recording, setRecording] = useState(false);
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

      const dismissed = dismissedRef.current[key];
      if (!dismissed) return true;

      const nextConfidence = normalizeConfidence(suggestion.confidence);
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
    setHandledReminderKeys(memory.handledReminders || {});
  }, [selectedReport]);

  useEffect(() => {
    writeLiveMemory(
      selectedReport,
      dismissedRef.current,
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
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    recordedChunksRef.current = [];
    setRecording(false);
    setTorchOn(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

  function quickPhoto() {
    const captured = captureFrame({ silent: true });
    if (!captured) return;
    onAddPhotoOnly(dataUrlToFile(captured, "ai-live-photo"));
    setMessage("Quick photo added to the Field Tool.");
  }

  function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    const stream = streamRef.current;
    if (!stream) {
      setMessage("Camera is not ready to record.");
      return;
    }

    try {
      const mimeTypes = [
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mimeType =
        mimeTypes.find((value) => MediaRecorder.isTypeSupported?.(value)) || "";

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        setRecording(false);

        if (!chunks.length) return;

        const type = recorder.mimeType || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const file = new File(
          chunks,
          `ai-live-video-${Date.now()}.${extension}`,
          { type, lastModified: Date.now() },
        );

        onAddPhotoOnly(file);
        setMessage("Video added to the Field Tool.");
      };

      recorderRef.current = recorder;
      recorder.start(500);
      setRecording(true);
      setMessage("Recording video...");
    } catch (error: any) {
      setMessage(error?.message || "Video recording is not supported on this device.");
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

    setMessage("Finding added to report with photo. AI Watching resumed.");
  }

  function ignoreSuggestion(suggestion: AILiveSuggestion) {
    const key = createSuggestionKey(suggestion);
    if (key) {
      dismissedRef.current[key] = {
        confidence: normalizeConfidence(suggestion.confidence),
        at: Date.now(),
      };
      writeLiveMemory(
        selectedReport,
        dismissedRef.current,
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
    resolveReminder(reminder, "Checklist reminder marked complete. AI Watching can continue when all prompts are handled.");
  }

  function saveReminderPhoto(reminder: AILiveReminder) {
    const captured = frameFile || (captureFrame({ silent: true }) ? dataUrlToFile(latestFrameRef.current) : null);

    if (!captured) {
      setMessage("Capture a frame before adding this reminder photo.");
      return;
    }

    onAddPhotoOnly(captured);
    resolveReminder(reminder, "Reminder photo saved. AI Watching can continue when all prompts are handled.");
  }

  function ignoreReminder(reminder: AILiveReminder) {
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
  const pendingCount =
    visibleSuggestions.length +
    visibleReminders.length +
    (result?.limitations?.length || 0) +
    (result?.dataPlatePrompt?.needed ? 1 : 0);

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
    <div className="fixed inset-0 z-[2147483647] h-[100dvh] w-[100vw] overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full bg-black object-cover"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />

      <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(0.8rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close camera"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/70 text-3xl font-light text-white shadow-xl backdrop-blur active:scale-95"
        >
          ×
        </button>

        <button
          type="button"
          onClick={() => setAutoWatch((current) => !current)}
          disabled={!online || starting}
          className="pointer-events-auto rounded-2xl border border-white/15 bg-black/75 px-5 py-3 text-center shadow-xl backdrop-blur disabled:opacity-50"
        >
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-white">
            AI Second Inspector
          </span>
          <span className="mt-1 block text-sm font-bold text-white">
            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${autoWatch ? "bg-emerald-400" : "bg-slate-500"}`} />
            AI Watching: <span className={autoWatch ? "text-emerald-400" : "text-slate-300"}>{autoWatch ? "ON" : "OFF"}</span>
          </span>
        </button>

        <div className="pointer-events-auto grid gap-3">
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-xl backdrop-blur active:scale-95 ${torchOn ? "ring-2 ring-yellow-300" : ""}`}
          >
            <span className="text-xl">⚡</span>
            <span className="text-[9px] font-bold">Flash</span>
          </button>
          <button
            type="button"
            onClick={toggleFacingCamera}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-xl backdrop-blur active:scale-95"
          >
            <span className="text-lg">↻</span>
            <span className="text-[9px] font-bold">Flip</span>
          </button>
        </div>
      </div>

      {(primaryReminder || primarySuggestion) && (
        <div className="absolute bottom-[228px] left-4 right-4 z-20 grid grid-cols-2 gap-3">
          {primaryReminder && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="rounded-2xl border border-emerald-400/30 bg-black/75 p-4 text-left shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">
                  Coach
                </span>
                <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-black">
                  {visibleReminders.length}
                </span>
              </div>
              <p className="mt-2 line-clamp-4 text-sm font-bold leading-5 text-white">
                {primaryReminder.title}
              </p>
              {primaryReminder.detail && (
                <p className="mt-1 line-clamp-3 text-xs leading-4 text-slate-200">
                  {primaryReminder.detail}
                </p>
              )}
            </button>
          )}

          {primarySuggestion && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="rounded-2xl border border-purple-400/30 bg-black/75 p-4 text-left shadow-2xl backdrop-blur"
            >
              <span className="text-xs font-black uppercase tracking-[0.12em] text-purple-300">
                Live Suggestion
              </span>
              <p className="mt-2 line-clamp-3 text-sm font-bold leading-5 text-white">
                {primarySuggestion.title}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-4 text-slate-200">
                {primarySuggestion.observation}
              </p>
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="absolute bottom-[164px] left-4 z-20 rounded-2xl border border-white/15 bg-black/75 px-4 py-3 text-left shadow-xl backdrop-blur"
      >
        <span className="block text-xs font-black text-amber-200">🧠 Live Memory</span>
        <span className="mt-1 block text-sm font-bold text-white">
          {pendingCount} item{pendingCount === 1 ? "" : "s"} tracked ›
        </span>
      </button>

      <div className="absolute bottom-[174px] right-5 z-20 rounded-2xl border border-white/15 bg-black/75 px-5 py-3 text-center shadow-xl backdrop-blur">
        <span className="block text-xs text-white">Zoom</span>
        <span className="mt-1 block text-lg font-bold">1.0x</span>
      </div>

      <button
        type="button"
        onClick={quickPhoto}
        disabled={starting}
        aria-label="Take quick photo"
        className="absolute bottom-[112px] left-1/2 z-20 h-20 w-20 -translate-x-1/2 rounded-full border-[6px] border-white bg-white shadow-2xl ring-4 ring-teal-400 active:scale-95 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={() => setActionsOpen((current) => !current)}
        className="absolute bottom-[122px] right-5 z-20 rounded-2xl border border-white/15 bg-black/75 px-5 py-4 text-sm font-black tracking-wide text-white shadow-xl backdrop-blur active:scale-95"
      >
        ACTIONS {actionsOpen ? "⌄" : "⌃"}
      </button>

      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 grid grid-cols-4 gap-1 rounded-3xl border border-white/15 bg-black/80 p-3 shadow-2xl backdrop-blur-xl">
        <button type="button" onClick={quickPhoto} className="rounded-2xl px-2 py-2 text-center active:bg-white/10">
          <span className="block text-2xl">📷</span>
          <span className="mt-1 block text-[11px] font-bold">Quick Photo</span>
        </button>
        <button type="button" onClick={toggleRecording} className={`rounded-2xl px-2 py-2 text-center active:bg-white/10 ${recording ? "text-red-300" : ""}`}>
          <span className="block text-2xl">{recording ? "⏹" : "🎥"}</span>
          <span className="mt-1 block text-[11px] font-bold">{recording ? "Stop Video" : "Record Video"}</span>
        </button>
        <button type="button" onClick={analyzeCurrentFrame} disabled={analyzing || !online || starting} className="rounded-2xl px-2 py-2 text-center active:bg-white/10 disabled:opacity-50">
          <span className="block text-2xl">✨</span>
          <span className="mt-1 block text-[11px] font-bold">{analyzing ? "Analyzing" : "Analyze"}</span>
        </button>
        <button type="button" onClick={() => {
          const captured = frameFile || (captureFrame({ silent: true }) ? dataUrlToFile(latestFrameRef.current) : null);
          onScanDataPlate(captured);
        }} className="rounded-2xl px-2 py-2 text-center active:bg-white/10">
          <span className="block text-2xl">▣</span>
          <span className="mt-1 block text-[11px] font-bold">Data Plate</span>
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 h-8 bg-black/30" />

      {(actionsOpen || detailsOpen || cameraError) && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-black/45"
          onClick={() => {
            setActionsOpen(false);
            setDetailsOpen(false);
          }}
        >
          <div
            className="max-h-[78dvh] w-full overflow-y-auto rounded-t-[2rem] border-t border-white/20 bg-[#06101f]/98 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
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
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => captureFrame()} className="rounded-2xl border border-slate-600 bg-slate-900 p-4 font-black">Capture Frame</button>
                <button type="button" onClick={addPhotoOnly} className="rounded-2xl border border-teal-500 bg-teal-500/10 p-4 font-black text-teal-200">Add Photo Only</button>
                <button type="button" onClick={analyzeCurrentFrame} disabled={!online || analyzing} className="rounded-2xl border border-purple-500 bg-purple-500/10 p-4 font-black text-purple-200 disabled:opacity-50">Analyze Frame</button>
                <button type="button" onClick={() => onScanDataPlate(frameFile)} className="rounded-2xl border border-yellow-500 bg-yellow-500/10 p-4 font-black text-yellow-200">Scan Data Plate</button>
              </div>
            )}

            {detailsOpen && (
              <div className="space-y-4">
                {visibleSuggestions.map((suggestion, index) => (
                  <div key={`${createSuggestionKey(suggestion)}-${index}`} className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-purple-300">AI Suggestion</p>
                        <h3 className="mt-1 text-lg font-black">{suggestion.title}</h3>
                      </div>
                      <span className="rounded-full border border-purple-400/40 px-2 py-1 text-xs font-black text-purple-200">{confidenceLabel(suggestion.confidence)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">{suggestion.observation}</p>
                    {suggestion.implication && <p className="mt-2 text-sm leading-6 text-slate-300"><strong>Implication:</strong> {suggestion.implication}</p>}
                    {suggestion.recommendation && <p className="mt-2 text-sm leading-6 text-slate-300"><strong>Recommendation:</strong> {suggestion.recommendation}</p>}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => ignoreSuggestion(suggestion)} className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black">Ignore</button>
                      <button type="button" onClick={() => {
                        setMessage("Reminder saved for later in this live camera session.");
                        ignoreSuggestion(suggestion);
                      }} className="rounded-xl border border-yellow-500/60 px-3 py-3 text-xs font-black text-yellow-200">Remind (5m)</button>
                      <button type="button" onClick={() => useSuggestion(suggestion)} className="rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-black">Add Finding</button>
                    </div>
                  </div>
                ))}

                {visibleReminders.map((reminder, index) => (
                  <div key={`${createReminderKey(reminder)}-${index}`} className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-300">Section Coach</p>
                    <h3 className="mt-1 text-lg font-black">{reminder.title}</h3>
                    {reminder.detail && <p className="mt-2 text-sm leading-6 text-slate-200">{reminder.detail}</p>}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => ignoreReminder(reminder)} className="rounded-xl border border-slate-600 px-3 py-3 text-xs font-black">Ignore</button>
                      <button type="button" onClick={() => saveReminderPhoto(reminder)} className="rounded-xl border border-cyan-500/70 px-3 py-3 text-xs font-black text-cyan-100">Add Photo</button>
                      <button type="button" onClick={() => markReminderChecked(reminder)} className="rounded-xl bg-emerald-400 px-3 py-3 text-xs font-black text-black">Mark Checked</button>
                    </div>
                  </div>
                ))}

                {(result?.limitations || []).map((limitation, index) => (
                  <div key={`${limitation.title}-${index}`} className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-orange-300">Possible Limitation</p>
                    <h3 className="mt-1 text-lg font-black">{limitation.title}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{createLimitationText(limitation)}</p>
                    <button type="button" onClick={() => saveLimitationToSection(limitation, index)} disabled={savingLimitationIndex !== null} className="mt-4 w-full rounded-xl bg-orange-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50">
                      {savingLimitationIndex === index ? "Adding..." : "Add To Section Limitations"}
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
