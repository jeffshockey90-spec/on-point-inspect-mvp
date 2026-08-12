"use client";

import { useEffect, useRef, useState } from "react";
import { saveFileToDeviceGallery } from "../lib/nativeGallery";
import { uploadSectionReferencePhoto } from "../lib/sectionReferencePhotos";
import type { CaptureCategory, CaptureDraft } from "../lib/ai/captureTypes";
import CaptureConfirmCard from "./ai-camera/CaptureConfirmCard";
import PhotoMarkupEditor from "./PhotoMarkupEditor";

type Stage =
  | "idle"
  | "note_entry"
  | "collecting"
  | "drafting"
  | "confirm"
  | "ref_preview"
  | "capture_error";

type ExistingFinding = { id: string; title?: string; section?: string; severity?: string };

type Props = {
  online: boolean;
  selectedReport: string;
  currentSection: string;
  currentSeverity: string;
  sections: string[];
  onAccept: (
    category: CaptureCategory,
    draft: CaptureDraft,
    files: File | File[],
  ) => Promise<void>;
  existingFindings?: ExistingFinding[];
  onAttachToExisting?: (
    findingId: string,
    file: File,
    isVideo: boolean,
  ) => Promise<void>;
};

const CATEGORIES: {
  key: CaptureCategory;
  label: string;
  activeClass: string;
  idleClass: string;
  icon: string;
  supportsVideo: boolean;
}[] = [
  {
    key: "finding",
    label: "Findings",
    activeClass: "bg-red-500 text-white",
    idleClass: "border-red-400/60 text-red-200",
    icon: "🛠️",
    supportsVideo: true,
  },
  {
    key: "limitation",
    label: "Limitations",
    activeClass: "bg-amber-400 text-black",
    idleClass: "border-amber-400/60 text-amber-200",
    icon: "🚧",
    supportsVideo: false,
  },
  {
    key: "equipment",
    label: "Equipment",
    activeClass: "bg-blue-500 text-white",
    idleClass: "border-blue-400/60 text-blue-200",
    icon: "🔧",
    supportsVideo: false,
  },
  {
    key: "reference",
    label: "Reference",
    activeClass: "bg-teal-400 text-black",
    idleClass: "border-teal-400/60 text-teal-200",
    icon: "📎",
    supportsVideo: false,
  },
];

function dataUrlToFile(dataUrl: string, namePrefix = "ai-camera-frame") {
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
  sections,
  onAccept,
  existingFindings,
  onAttachToExisting,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const hardwareZoomSupportedRef = useRef(false);
  const focusResetTimerRef = useRef<number | null>(null);
  const gallerySavedKeysRef = useRef<Set<string>>(new Set());

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [torchOn, setTorchOn] = useState(false);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [muteAudio, setMuteAudio] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [focusMessage, setFocusMessage] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(3);
  const [cameraError, setCameraError] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [category, setCategory] = useState<CaptureCategory | null>(null);
  const [noteText, setNoteText] = useState("");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState("");
  const [capturedIsVideo, setCapturedIsVideo] = useState(false);
  const [capturedFrameForAi, setCapturedFrameForAi] = useState("");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  // Photos bundled into the CURRENT finding (multi-angle capture). Empty for
  // single-photo/non-finding captures, which keep the original one-file flow.
  const [shots, setShots] = useState<
    { file: File; frame: string; isVideo: boolean }[]
  >([]);
  const [referenceCaption, setReferenceCaption] = useState("");
  const [referenceSection, setReferenceSection] = useState(currentSection);
  const [showMarkup, setShowMarkup] = useState(false);
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    function openForCategory(
      cat: CaptureCategory,
      prefillNote: string,
    ) {
      setOpen(true);
      setCategory(cat);
      setNoteText(prefillNote);
      setStage("note_entry");
      window.setTimeout(() => void startCamera(facingMode), 50);
    }

    function handleCoachCapture(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      const title = String(detail.title || "");
      const recommendation = String(detail.recommendation || "");
      openForCategory(
        "finding",
        [title, recommendation].filter(Boolean).join(" — "),
      );
    }

    function handleCoachLimitation(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      const title = String(detail.title || "");
      const recommendation = String(detail.recommendation || "");
      openForCategory(
        "limitation",
        [title, recommendation].filter(Boolean).join(" — "),
      );
    }

    window.addEventListener(
      "opi:coach-capture-request",
      handleCoachCapture as EventListener,
    );
    window.addEventListener(
      "opi:coach-limitation-request",
      handleCoachLimitation as EventListener,
    );
    return () => {
      window.removeEventListener(
        "opi:coach-capture-request",
        handleCoachCapture as EventListener,
      );
      window.removeEventListener(
        "opi:coach-limitation-request",
        handleCoachLimitation as EventListener,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => {
    if (!open) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (capturedIsVideo && capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPreviewUrl]);

  async function startCamera(mode: "environment" | "user" = facingMode) {
    if (starting) return;

    setStarting(true);
    setCameraError("");

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
        },
      });

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & {
        zoom?: { min?: number; max?: number };
      };
      const settings = videoTrack?.getSettings?.() as MediaTrackSettings & {
        zoom?: number;
      };
      const supportsHardwareZoom = Boolean(
        capabilities?.zoom?.max && capabilities.zoom.max > 1,
      );
      hardwareZoomSupportedRef.current = supportsHardwareZoom;
      setZoomMin(
        supportsHardwareZoom ? Math.max(1, Number(capabilities.zoom?.min || 1)) : 1,
      );
      setZoomMax(
        supportsHardwareZoom ? Math.min(8, Number(capabilities.zoom?.max || 3)) : 3,
      );
      setZoomLevel(Math.max(1, Number(settings?.zoom || 1)));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
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

  function captureFrame(): string {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) return "";

    const maxWidth = 1920;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return "";

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

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  async function handleCameraTapFocus(event: React.PointerEvent<HTMLDivElement>) {
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
        }
      }
    } catch {}

    setFocusMessage("Focus adjusted");

    if (focusResetTimerRef.current) window.clearTimeout(focusResetTimerRef.current);
    focusResetTimerRef.current = window.setTimeout(() => {
      setFocusPoint(null);
      setFocusMessage("");
      focusResetTimerRef.current = null;
    }, 1200);
  }

  async function toggleFacingCamera() {
    if (starting) return;
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    stopCamera();
    window.setTimeout(() => void startCamera(nextMode), 120);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
        torch?: boolean;
      };
      if (!capabilities?.torch) return;

      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {}
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

  function selectCategory(cat: CaptureCategory) {
    setCategory(cat);
    setNoteText("");
    setCaptureMode("photo");
    setStage("note_entry");
  }

  async function proceedAfterCapture(
    file: File,
    frameDataUrlForAi: string,
    isVideo: boolean,
  ) {
    void saveFileToDeviceGallerySafe(file);

    setCapturedFile(file);
    setCapturedIsVideo(isVideo);
    setCapturedPreviewUrl(isVideo ? URL.createObjectURL(file) : frameDataUrlForAi);
    setCapturedFrameForAi(frameDataUrlForAi);

    if (category === "reference") {
      setReferenceCaption("");
      setReferenceSection(currentSection);
      setStage("ref_preview");
      return;
    }

    // Finding media goes into a tray FIRST — photos AND videos of the same
    // defect. The inspector adds as many as they want, then taps Analyze once;
    // the AI reads every still (photos + a frame from each video) into one
    // finding, and all files attach. No draft happens until then.
    if (category === "finding") {
      setShots((current) => [
        ...current,
        { file, frame: frameDataUrlForAi, isVideo },
      ]);
      setStage("collecting");
      return;
    }

    setStage("drafting");
    await runDraft(frameDataUrlForAi, file);
  }

  // Run the AI on ALL the tray media → one finding. Only real still frames are
  // sent to the model (photos + each video's representative frame).
  async function analyzeShots() {
    if (!shots.length) return;
    const last = shots[shots.length - 1];
    const frames = shots.map((s) => s.frame).filter(Boolean);
    setStage("drafting");
    await runDraft(last.frame, last.file, undefined, frames);
  }

  async function saveFileToDeviceGallerySafe(file: File) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (gallerySavedKeysRef.current.has(key)) return;
    try {
      const saved = await saveFileToDeviceGallery(file);
      if (saved) gallerySavedKeysRef.current.add(key);
    } catch {}
  }

  async function handlePhotoShutter() {
    const frame = captureFrame();
    if (!frame) return;
    const file = dataUrlToFile(frame, `ai-camera-${category}`);
    await proceedAfterCapture(file, frame, false);
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
      setCameraError(
        "Video recording is not supported by this device/browser.",
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
        supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      // When muted, record a video-only stream so the clip has no audio track.
      const recordStream = muteAudio
        ? new MediaStream(stream.getVideoTracks())
        : stream;
      const recorder = new MediaRecorder(recordStream, {
        videoBitsPerSecond: 10_000_000,
        ...(muteAudio ? {} : { audioBitsPerSecond: 128_000 }),
        ...(mimeType ? { mimeType } : {}),
      });

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
          setCameraError("No video data was captured.");
          return;
        }

        const type = recorder.mimeType || chunks[0]?.type || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const file = new File(
          chunks,
          `ai-camera-${category}-${Date.now()}.${extension}`,
          { type, lastModified: Date.now() },
        );

        // The video's still-live feed gives us one representative frame to
        // send to the AI draft endpoints - vision models can't read video
        // directly, but the full video is what actually gets attached.
        const representativeFrame = captureFrame();
        void proceedAfterCapture(file, representativeFrame, true);
      };

      recorder.onerror = () => {
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        setRecordingVideo(false);
        setCameraError("Video recording failed.");
      };

      recorder.start();
      setRecordingVideo(true);
    } catch {
      setCameraError("Could not start video recording.");
    }
  }

  function handlePrimaryCapture() {
    if (captureMode === "video") {
      toggleVideoRecording();
      return;
    }
    void handlePhotoShutter();
  }

  async function runDraft(
    frameDataUrl: string,
    file: File,
    noteOverride?: string,
    allFrames?: string[],
  ) {
    setDraftError("");
    const note = typeof noteOverride === "string" ? noteOverride : noteText;

    try {
      if (category === "finding") {
        const response = await fetch("/api/ai-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            note,
            inspectionId: selectedReport,
            section: currentSection,
            severity: currentSeverity,
            images: allFrames && allFrames.length ? allFrames : [frameDataUrl],
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "AI could not draft this finding.");

        setDraft({
          kind: "finding",
          title: data.title,
          section: data.section,
          severity: data.severity,
          observation: data.observation,
          implication: data.implication,
          recommendation: data.recommendation,
          confidence: data.confidence,
        });
        setStage("confirm");
        return;
      }

      if (category === "limitation") {
        const response = await fetch("/api/ai/live-inspection-camera", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            imageDataUrl: frameDataUrl,
            inspectionId: selectedReport,
            currentSection,
            currentSeverity,
            focus: "limitation",
            note,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "AI could not draft this limitation.");

        const limitation = data.limitation;
        setDraft({
          kind: "limitation",
          title: limitation?.title || note || "Inspection Limitation",
          section: limitation?.section || currentSection,
          limitation: limitation?.limitation || note || "",
          reason: limitation?.reason || "",
          recommendation: limitation?.recommendation || "",
          confidence: limitation?.confidence,
        });
        setStage("confirm");
        return;
      }

      if (category === "equipment") {
        const formData = new FormData();
        formData.append("images", file);
        formData.append("image", file);
        formData.append("inspectionId", selectedReport || "");
        formData.append("inspection_id", selectedReport || "");
        if (note.trim()) formData.append("note", note.trim());

        const response = await fetch("/api/analyze-equipment", {
          method: "POST",
          body: formData,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
          throw new Error(data?.error || "AI could not analyze this equipment.");
        }

        setDraft({ ...data, kind: "equipment" });
        setStage("confirm");
        return;
      }
    } catch (error: any) {
      setDraftError(error?.message || "AI drafting failed.");
      setStage("capture_error");
    }
  }

  function openMarkup() {
    if (!capturedFile || capturedIsVideo) return;
    setShowMarkup(true);
  }

  async function saveMarkup(_items: any[], flattenedDataUrl: string) {
    if (!capturedFile || savingMarkup) return;

    setSavingMarkup(true);

    try {
      const response = await fetch(flattenedDataUrl);
      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("The marked-up photo was empty.");
      }

      const originalBaseName = String(capturedFile.name || "ai-camera-photo")
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

      setCapturedFile(markedFile);
      setCapturedPreviewUrl(flattenedDataUrl);
      setCapturedFrameForAi(flattenedDataUrl);
      setShowMarkup(false);
    } catch (error: any) {
      setSaveError(error?.message || "Could not save the photo markup.");
      throw error;
    } finally {
      setSavingMarkup(false);
    }
  }

  async function handleAccept(editedDraft: CaptureDraft) {
    if (!category || !capturedFile) return;

    setSaving(true);
    setSaveError("");

    try {
      if (category === "reference") {
        await uploadSectionReferencePhoto({
          inspectionId: selectedReport,
          section: referenceSection,
          file: capturedFile,
          caption: referenceCaption,
        });
      } else {
        await onAccept(
          category,
          editedDraft,
          shots.length ? shots.map((s) => s.file) : capturedFile,
        );
      }

      setToast(`${CATEGORIES.find((c) => c.key === category)?.label} saved.`);
      resetCaptureState();
      setStage("note_entry");
    } catch (error: any) {
      setSaveError(error?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // AI drafting failed but the photo/video is already captured — never make the
  // inspector lose it. Save the media to the report with a minimal manual draft
  // (their note + current section/severity) so it lands in the inspection and
  // the write-up can be finished later in the report editor.
  function handleSaveWithoutAi() {
    if (!category || !capturedFile) return;
    const note = noteText.trim();

    let fallback: CaptureDraft;
    if (category === "limitation") {
      fallback = {
        kind: "limitation",
        title: note ? note.slice(0, 70) : "Inspection Limitation",
        section: currentSection,
        limitation:
          note || "Limitation captured in the field — details to be added.",
        reason: "",
        recommendation: "",
      };
    } else if (category === "equipment") {
      fallback = {
        kind: "equipment",
        section: currentSection,
        severity: currentSeverity,
        observation: note || "",
        condition: "",
      };
    } else {
      fallback = {
        kind: "finding",
        title: note ? note.slice(0, 70) : "Field photo — details pending",
        section: currentSection,
        severity: currentSeverity,
        observation: note || "",
        implication: "",
        recommendation: "",
      };
    }

    void handleAccept(fallback);
  }

  // Re-run the AI write-up on the SAME captured media using a new inspector note,
  // without making the inspector retake the photo/video.
  function handleRegenerate(newNote: string) {
    if (!capturedFile || !capturedFrameForAi) return;
    setNoteText(newNote);
    setSaveError("");
    setStage("drafting");
    void runDraft(
      capturedFrameForAi,
      capturedFile,
      newNote,
      shots.length ? shots.map((s) => s.frame).filter(Boolean) : undefined,
    );
  }

  // Snap another angle of the SAME defect. Keeps the accumulated shots + note
  // and returns to the live view; the next shutter appends and re-analyzes all.
  function handleAddAngle() {
    setDraft(null);
    setDraftError("");
    setSaveError("");
    setStage("note_entry");
  }

  // Attach the captured media to a defect that already exists in the report,
  // instead of creating a brand-new finding.
  async function handleAttachToExisting(findingId: string) {
    if (!findingId || !capturedFile || !onAttachToExisting) return;
    setSaving(true);
    setSaveError("");
    try {
      await onAttachToExisting(findingId, capturedFile, capturedIsVideo);
      setToast("Media attached to defect.");
      resetCaptureState();
      setStage("note_entry");
    } catch (error: any) {
      setSaveError(error?.message || "Could not attach the media. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetCaptureState() {
    if (capturedIsVideo && capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedFile(null);
    setCapturedPreviewUrl("");
    setCapturedIsVideo(false);
    setCapturedFrameForAi("");
    setShots([]);
    setDraft(null);
    setDraftError("");
    setReferenceCaption("");
    setNoteText("");
    setShowMarkup(false);
  }

  function handleRetake() {
    resetCaptureState();
    setStage("note_entry");
  }

  function handleClose() {
    const pendingDecision =
      stage === "drafting" ||
      stage === "confirm" ||
      stage === "ref_preview" ||
      stage === "collecting";

    if (
      pendingDecision &&
      !window.confirm(
        "AI drafted something waiting for your decision. Discard it and close the camera?",
      )
    ) {
      return;
    }

    resetCaptureState();
    setCategory(null);
    setStage("idle");
    setOpen(false);
  }

  const activeCategoryMeta = CATEGORIES.find((c) => c.key === category) || null;

  const cameraUi = !open ? (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
        AI Capture Camera
      </p>
      <h2 className="mt-1 text-xl font-black">Findings · Limitations · Equipment · Reference</h2>
      <p className="mt-1 text-sm text-slate-300">
        Pick a category, capture a photo or video, and AI drafts it for your
        approval. Nothing saves until you accept it.
      </p>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setStage("idle");
          setCategory(null);
          window.setTimeout(() => void startCamera(facingMode), 50);
        }}
        className="mt-4 min-h-[48px] w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-cyan-300 [touch-action:manipulation]"
      >
        🤖 Open AI Camera
      </button>
    </div>
  ) : (
    <div className="fixed inset-0 z-[2147483647] h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full bg-black object-cover"
        style={
          hardwareZoomSupportedRef.current || zoomLevel <= 1
            ? undefined
            : { transform: `scale(${zoomLevel})`, transformOrigin: "center center" }
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
          style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%` }}
        />
      )}

      {focusMessage && (
        <div className="pointer-events-none absolute left-1/2 top-[38%] z-[22] -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-black text-yellow-200 backdrop-blur">
          {focusMessage}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/65" />

      <div
        className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 px-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close camera"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/70 text-3xl font-light text-white shadow-2xl backdrop-blur active:scale-95"
        >
          ×
        </button>

        {activeCategoryMeta && (
          <span
            className={`rounded-full border px-4 py-2 text-xs font-black ${activeCategoryMeta.idleClass} bg-black/70 backdrop-blur`}
          >
            {activeCategoryMeta.icon} {activeCategoryMeta.label}
          </span>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg shadow-2xl backdrop-blur active:scale-95 ${
              torchOn
                ? "border-yellow-300 bg-yellow-400/30 text-yellow-200"
                : "border-white/15 bg-black/70 text-white"
            }`}
            aria-label="Toggle flash"
          >
            ⚡
          </button>
          <button
            type="button"
            onClick={toggleFacingCamera}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-lg text-white shadow-2xl backdrop-blur active:scale-95"
            aria-label="Flip camera"
          >
            🔄
          </button>
        </div>
      </div>

      {zoomMax > zoomMin && stage !== "confirm" && stage !== "ref_preview" && (
        <div className="absolute right-4 top-24 z-20 flex flex-col items-center gap-2 rounded-full border border-white/15 bg-black/60 px-2 py-3 backdrop-blur">
          <input
            type="range"
            min={zoomMin}
            max={zoomMax}
            step={0.1}
            value={zoomLevel}
            onChange={(event) => void handleZoomChange(Number(event.target.value))}
            className="h-24 w-6 [writing-mode:vertical-lr] [direction:rtl]"
            aria-label="Zoom"
          />
          <span className="text-[10px] font-black text-white">
            {zoomLevel.toFixed(1)}x
          </span>
        </div>
      )}

      {cameraError && (
        <div className="absolute left-1/2 top-1/2 z-20 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-red-500/50 bg-red-950/90 p-4 text-center text-sm font-bold text-red-200">
          {cameraError}
        </div>
      )}

      {stage === "idle" && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 px-4"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <p className="mb-3 text-center text-xs font-black uppercase tracking-wide text-white/80">
            What are you capturing?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => selectCategory(cat.key)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 text-sm font-black shadow-xl backdrop-blur active:scale-[0.97] ${cat.idleClass} bg-black/55`}
              >
                <span className="text-2xl leading-none">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "note_entry" && activeCategoryMeta && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 px-4"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mb-3 max-w-[520px] rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder={
                activeCategoryMeta.key === "reference"
                  ? "Optional caption (add after capture too)"
                  : "Optional note for AI — leave blank and AI will describe what it sees"
              }
              className="min-h-16 w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => {
                setCategory(null);
                setStage("idle");
              }}
              className="mt-2 text-xs font-bold text-white/60"
            >
              ← Change category
            </button>
          </div>

          {activeCategoryMeta.supportsVideo && (
            <div className="mx-auto mb-2 grid max-w-[220px] grid-cols-2 rounded-full border border-white/15 bg-black/70 p-1 shadow-xl backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  if (!recordingVideo) setCaptureMode("photo");
                }}
                disabled={recordingVideo}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  captureMode === "photo" ? "bg-white text-black" : "text-white"
                } disabled:opacity-40`}
              >
                PHOTO
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode("video")}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  captureMode === "video" ? "bg-red-500 text-white" : "text-white"
                }`}
              >
                VIDEO
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-6">
            {captureMode === "video" && <div className="h-12 w-12" />}

            <button
              type="button"
              onClick={handlePrimaryCapture}
              disabled={starting}
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
                  : "border-white bg-white ring-4 ring-teal-400"
              }`}
            >
              {captureMode === "video" && recordingVideo && (
                <span className="mx-auto block h-7 w-7 rounded-md bg-white" />
              )}
            </button>

            {captureMode === "video" && (
              <button
                type="button"
                onClick={() => setMuteAudio((current) => !current)}
                disabled={recordingVideo}
                aria-label={muteAudio ? "Unmute microphone" : "Mute microphone"}
                title={muteAudio ? "Sound off — recording video only" : "Sound on"}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl backdrop-blur disabled:opacity-40 ${
                  muteAudio ? "bg-red-600/80 text-white" : "bg-black/65 text-white"
                }`}
              >
                {muteAudio ? "🔇" : "🎤"}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "drafting" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
          <p className="text-sm font-black text-cyan-200">
            AI is drafting your {activeCategoryMeta?.label.toLowerCase()}…
          </p>
        </div>
      )}

      {stage === "capture_error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
          <p className="text-sm font-bold text-red-200">{draftError}</p>
          <p className="text-xs text-slate-300">
            Your {capturedIsVideo ? "video" : "photo"} is safe — save it to the report now
            and finish the write-up later, or try the AI again.
          </p>
          {saveError && (
            <p className="text-xs font-bold text-red-300">{saveError}</p>
          )}
          <button
            type="button"
            onClick={handleSaveWithoutAi}
            disabled={saving}
            className="w-full max-w-xs rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black disabled:cursor-wait disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : `Save ${capturedIsVideo ? "Video" : "Photo"} Without AI`}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRetake}
              disabled={saving}
              className="rounded-xl border border-slate-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() =>
                capturedFile &&
                capturedFrameForAi &&
                void runDraft(capturedFrameForAi, capturedFile)
              }
              disabled={saving}
              className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-black disabled:opacity-60"
            >
              Try AI Again
            </button>
          </div>
        </div>
      )}

      {stage === "collecting" && (
        <div className="absolute inset-0 z-30 flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
              {shots.length} shot{shots.length === 1 ? "" : "s"} · same defect
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              {shots.map((s, i) => (
                <div key={i} className="relative">
                  {s.frame ? (
                    <img
                      src={s.frame}
                      alt={`Shot ${i + 1}`}
                      className="h-24 w-full rounded-lg border border-white/15 object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center rounded-lg border border-white/15 bg-black/50 text-2xl">
                      🎥
                    </div>
                  )}
                  {s.isVideo && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-black text-white">
                      ▶ VIDEO
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Add as many angles of the <b className="text-white">same defect</b> as you want —
              wide shot, close-up, label. The AI reads them all into one finding.
            </p>

            <div className="mt-3 rounded-xl border border-white/15 bg-black/40 p-3">
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Note for AI (optional)
              </label>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="e.g. 'cracked heat exchanger — call it a safety concern', or leave blank and AI describes what it sees"
                className="mt-1 min-h-16 w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setStage("note_entry")}
              className="w-full rounded-xl border border-cyan-400/60 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-200 [touch-action:manipulation]"
            >
              ＋ Take another photo or video
            </button>
            <button
              type="button"
              onClick={() => void analyzeShots()}
              className="w-full rounded-xl bg-teal-400 px-4 py-3 text-sm font-black text-slate-950 [touch-action:manipulation]"
            >
              ✨ Analyze {shots.length} shot{shots.length === 1 ? "" : "s"} → finding
            </button>
            <button
              type="button"
              onClick={() => {
                resetCaptureState();
                setStage("note_entry");
              }}
              className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-black text-slate-400 [touch-action:manipulation]"
            >
              Discard &amp; start over
            </button>
          </div>
        </div>
      )}

      {stage === "confirm" && draft && (
        <CaptureConfirmCard
          mediaPreviewUrl={capturedPreviewUrl}
          isVideo={capturedIsVideo}
          draft={draft}
          busy={saving}
          error={saveError}
          initialNote={noteText}
          existingFindings={onAttachToExisting ? existingFindings : undefined}
          onAccept={handleAccept}
          onRegenerate={handleRegenerate}
          onAttachToExisting={onAttachToExisting ? handleAttachToExisting : undefined}
          onRetake={handleRetake}
          onMarkup={openMarkup}
          extraPreviewUrls={
            shots.length > 1 ? shots.map((s) => s.frame).filter(Boolean) : undefined
          }
          onAddAngle={draft.kind === "finding" ? handleAddAngle : undefined}
        />
      )}

      {stage === "ref_preview" && (
        <div className="absolute inset-0 z-30 flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <img
                src={capturedPreviewUrl}
                alt="Reference photo"
                className="max-h-64 w-full object-cover"
              />
            </div>

            <button
              type="button"
              onClick={openMarkup}
              disabled={saving}
              className="mt-3 w-full rounded-xl border border-cyan-400/60 bg-cyan-500/10 px-4 py-2.5 text-sm font-black text-cyan-200 disabled:opacity-50"
            >
              🖊 Markup Photo (optional)
            </button>

            <div className="mt-4">
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Section
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                value={referenceSection}
                onChange={(event) => setReferenceSection(event.target.value)}
              >
                {sections.map((sectionOption) => (
                  <option key={sectionOption} value={sectionOption}>
                    {sectionOption}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Caption (optional)
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                value={referenceCaption}
                onChange={(event) => setReferenceCaption(event.target.value)}
                placeholder="What does this photo show?"
              />
            </div>
            {saveError && (
              <div className="mt-4 rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-200">
                {saveError}
              </div>
            )}
          </div>
          <div
            className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={handleRetake}
              disabled={saving}
              className="min-h-12 rounded-xl border border-slate-500 px-2 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() =>
                void handleAccept({ kind: "reference", caption: referenceCaption })
              }
              disabled={saving}
              className="min-h-12 rounded-xl bg-emerald-400 px-2 py-3 text-sm font-black text-black disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full bg-emerald-500/90 px-4 py-2 text-xs font-black text-black shadow-2xl">
          ✓ {toast}
        </div>
      )}

      {!online && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-black text-amber-300">
          Offline — AI drafting needs a connection
        </div>
      )}

      {showMarkup && capturedPreviewUrl && (
        <div className="absolute inset-0 z-50">
          <PhotoMarkupEditor
            imageUrl={capturedPreviewUrl}
            severity={currentSeverity}
            onSave={saveMarkup}
            onCancel={() => {
              if (savingMarkup) return;
              setShowMarkup(false);
            }}
          />
        </div>
      )}
    </div>
  );

  return cameraUi;
}
