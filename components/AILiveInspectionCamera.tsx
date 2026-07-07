"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_DISMISSED_AGE_MS = 8 * 60 * 1000;
const RESURFACE_CONFIDENCE_BOOST = 0.12;

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

type AILiveResult = {
  area?: string;
  system?: string;
  confidence?: number;
  suggestions?: AILiveSuggestion[];
  reminders?: AILiveReminder[];
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
  const dismissedRef = useRef<Record<string, { confidence: number; at: number }>>({});

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [frameDataUrl, setFrameDataUrl] = useState("");
  const [result, setResult] = useState<AILiveResult | null>(null);
  const [message, setMessage] = useState("");

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

  useEffect(() => {
    if (!open) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open]);

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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFrame() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("Camera frame is not ready yet.");
      return "";
    }

    const maxWidth = 1100;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("Could not capture camera frame.");
      return "";
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    setFrameDataUrl(dataUrl);
    setMessage("Frame captured. Review, analyze, or add it as a photo.");
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

    try {
      const res = await fetch("/api/ai/live-inspection-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          inspectionId: selectedReport,
          currentSection,
          currentSeverity,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || "AI Live Camera analysis failed.");
        return;
      }

      setResult(data);
      const count = Array.isArray(data.suggestions) ? data.suggestions.length : 0;
      const reminderCount = Array.isArray(data.reminders) ? data.reminders.length : 0;
      setMessage(
        `AI reviewed this area. ${count} suggestion${count === 1 ? "" : "s"} and ${reminderCount} reminder${reminderCount === 1 ? "" : "s"} found. Inspector approval is required.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "AI Live Camera analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function useSuggestion(suggestion: AILiveSuggestion) {
    onUseSuggestion(suggestion, frameFile);
    setMessage("Suggestion loaded into Field Tool. Review and tap Save Finding if you agree.");
  }

  function ignoreSuggestion(suggestion: AILiveSuggestion) {
    const key = createSuggestionKey(suggestion);
    if (key) {
      dismissedRef.current[key] = {
        confidence: normalizeConfidence(suggestion.confidence),
        at: Date.now(),
      };
    }

    setResult((current) => {
      if (!current) return current;
      return {
        ...current,
        suggestions: (current.suggestions || []).filter(
          (item) => createSuggestionKey(item) !== key,
        ),
      };
    });

    setMessage(
      "Suggestion ignored for now. AI may show it again later if confidence improves or stronger evidence appears.",
    );
  }

  function addPhotoOnly() {
    if (!frameFile) {
      const captured = captureFrame();
      if (!captured) return;
      const nextFile = dataUrlToFile(captured);
      onAddPhotoOnly(nextFile);
      return;
    }

    onAddPhotoOnly(frameFile);
  }

  return (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
            AI Live Inspection Camera
          </p>
          <h2 className="mt-1 text-xl font-black">AI Second Inspector Camera</h2>
          <p className="mt-1 text-sm text-slate-300">
            Suggestions only. Inspector approval is required before anything is saved.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            if (!open) window.setTimeout(startCamera, 50);
          }}
          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-black transition active:scale-[0.98] hover:bg-cyan-300 [touch-action:manipulation]"
        >
          {open ? "Close Camera" : "📸 Open AI Camera"}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="aspect-video w-full bg-black object-cover"
            />

            {frameDataUrl && (
              <div className="border-t border-slate-800 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Captured Frame
                </p>
                <img
                  src={frameDataUrl}
                  alt="Captured inspection frame"
                  className="max-h-52 w-full rounded-xl object-contain"
                />
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm font-bold text-red-200">
              {cameraError}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-cyan-500/40 bg-black/30 p-3 text-sm font-bold text-cyan-100">
              {message}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={captureFrame}
              disabled={starting}
              className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-slate-100 transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-50"
            >
              Capture Frame
            </button>

            <button
              type="button"
              onClick={analyzeCurrentFrame}
              disabled={starting || analyzing || !online}
              className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Frame"}
            </button>

            <button
              type="button"
              onClick={addPhotoOnly}
              disabled={!frameDataUrl}
              className="rounded-xl border border-teal-500 px-4 py-3 text-sm font-black text-teal-200 transition active:scale-[0.98] hover:bg-teal-500 hover:text-black disabled:opacity-50"
            >
              Add Photo Only
            </button>

            <button
              type="button"
              onClick={() => onScanDataPlate(frameFile)}
              disabled={!frameDataUrl}
              className="rounded-xl border border-yellow-500 px-4 py-3 text-sm font-black text-yellow-200 transition active:scale-[0.98] hover:bg-yellow-400 hover:text-black disabled:opacity-50"
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
                    onClick={() => onScanDataPlate(frameFile)}
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

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => useSuggestion(suggestion)}
                          className="rounded-xl bg-teal-400 px-4 py-2 text-sm font-black text-black"
                        >
                          Use This Finding
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

              {Array.isArray(result.reminders) && result.reminders.length > 0 && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                    Before You Walk Away
                  </p>
                  <div className="mt-3 space-y-2">
                    {result.reminders.map((reminder, index) => (
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
                        {reminder.action === "scan_data_plate" && (
                          <button
                            type="button"
                            onClick={() => onScanDataPlate(frameFile)}
                            className="mt-2 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black text-black"
                          >
                            Add Frame / Scan Data Plate
                          </button>
                        )}
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
}
