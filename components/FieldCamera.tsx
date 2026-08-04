"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveFileToDeviceGallery } from "../lib/nativeGallery";
import {
  nativeCameraAvailable,
  openNativeFieldCamera,
} from "../lib/nativeCamera";

type Props = {
  destinationLabel: string;
  selectedMediaCount: number;
  allowVideo?: boolean;
  onAddMedia: (files: File[]) => void;
};

type CaptureMode = "photo" | "video";

export default function FieldCamera({
  destinationLabel,
  selectedMediaCount,
  allowVideo = true,
  onAddMedia,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const focusTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const hardwareZoomRef = useRef(false);
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("photo");
  const [muteAudio, setMuteAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(3);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [focusMessage, setFocusMessage] = useState("");
  const [message, setMessage] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [focusLocked, setFocusLocked] = useState(false);
  const [macroMode, setMacroMode] = useState(false);
  const [autoSaveGallery, setAutoSaveGallery] = useState(true);
  const [sessionCaptureCount, setSessionCaptureCount] = useState(0);

  function triggerHaptic(pattern: number | number[] = 18) {
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  }

  function getAudioContext() {
    if (typeof window === "undefined") return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }

  async function resumeAudioContext() {
    const context = getAudioContext();
    if (!context) return null;

    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }

    return context;
  }

  async function playTone({
    frequency,
    duration,
    volume = 0.12,
    type = "sine",
    delay = 0,
  }: {
    frequency: number;
    duration: number;
    volume?: number;
    type?: OscillatorType;
    delay?: number;
  }) {
    const context = await resumeAudioContext();
    if (!context) return;

    const startAt = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + Math.max(0.03, duration),
    );

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  async function playPhotoShutterSound() {
    // Short two-part shutter click made with Web Audio, so no audio asset is needed.
    await Promise.all([
      playTone({
        frequency: 1180,
        duration: 0.045,
        volume: 0.16,
        type: "square",
      }),
      playTone({
        frequency: 760,
        duration: 0.065,
        volume: 0.12,
        type: "triangle",
        delay: 0.045,
      }),
    ]);
  }

  async function playRecordStartSound() {
    await Promise.all([
      playTone({
        frequency: 660,
        duration: 0.09,
        volume: 0.13,
        type: "sine",
      }),
      playTone({
        frequency: 880,
        duration: 0.11,
        volume: 0.13,
        type: "sine",
        delay: 0.08,
      }),
    ]);
  }

  async function playRecordStopSound() {
    await Promise.all([
      playTone({
        frequency: 880,
        duration: 0.09,
        volume: 0.13,
        type: "sine",
      }),
      playTone({
        frequency: 560,
        duration: 0.13,
        volume: 0.13,
        type: "sine",
        delay: 0.08,
      }),
    ]);
  }

  function startRecordingTimer() {
    recordingStartedAtRef.current = Date.now();
    setRecordingSeconds(0);

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
    }

    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
        ),
      );
    }, 250);
  }

  function stopRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recordingStartedAtRef.current = 0;
  }

  function formatRecordingTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0",
    )}`;
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("opi-field-camera-auto-gallery");
      if (saved !== null) setAutoSaveGallery(saved !== "false");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "opi-field-camera-auto-gallery",
        String(autoSaveGallery),
      );
    } catch {}
  }, [autoSaveGallery]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      stopCamera();
    };
  }, [open]);

  async function startCamera(mode: "environment" | "user" = facingMode) {
    if (starting) return;

    setStarting(true);
    setCameraError("");
    setMessage("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported on this device.");
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
        audio: allowVideo
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: { ideal: 2 },
              sampleRate: { ideal: 48000 },
            }
          : false,
      });

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as
        | (MediaTrackCapabilities & {
            zoom?: { min?: number; max?: number; step?: number };
          })
        | undefined;
      const settings = videoTrack?.getSettings?.() as
        | (MediaTrackSettings & { zoom?: number })
        | undefined;

      const supportsHardwareZoom = Boolean(
        capabilities?.zoom?.max && capabilities.zoom.max > 1,
      );
      hardwareZoomRef.current = supportsHardwareZoom;
      setZoomMin(
        supportsHardwareZoom
          ? Math.max(1, Number(capabilities?.zoom?.min || 1))
          : 1,
      );
      setZoomMax(
        supportsHardwareZoom
          ? Math.min(8, Number(capabilities?.zoom?.max || 3))
          : 3,
      );
      setZoom(Math.max(1, Number(settings?.zoom || 1)));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setMessage("Ready. Tap the preview to refocus.");
    } catch (error: any) {
      setCameraError(error?.message || "Could not start the Field Camera.");
    } finally {
      setStarting(false);
    }
  }

  function stopCamera() {
    stopRecordingTimer();
    setRecordingSeconds(0);

    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {}
    }

    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setTorchOn(false);
    setFocusPoint(null);
    setFocusMessage("");

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function toggleFocusLock() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { focusMode?: string[] })
        | undefined;
      const next = !focusLocked;
      const mode =
        next && capabilities?.focusMode?.includes("manual")
          ? "manual"
          : capabilities?.focusMode?.includes("continuous")
            ? "continuous"
            : "";

      if (mode) {
        await track.applyConstraints({
          advanced: [{ focusMode: mode } as any],
        });
      }

      setFocusLocked(next);
      setMessage(next ? "Focus locked." : "Continuous autofocus restored.");
      triggerHaptic(14);
    } catch {
      setMessage("Focus lock is not supported by this device.");
    }
  }

  async function toggleMacroMode() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities?.() as
        | (MediaTrackCapabilities & {
            focusMode?: string[];
            focusDistance?: { min?: number; max?: number; step?: number };
          })
        | undefined;

      const next = !macroMode;
      const advanced: any[] = [];

      if (capabilities?.focusMode?.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }

      if (next && capabilities?.focusDistance) {
        advanced.push({
          focusDistance: Number(capabilities.focusDistance.min || 0),
        });
      }

      if (advanced.length) {
        await track.applyConstraints({ advanced } as any);
      }

      setMacroMode(next);
      setMessage(
        next
          ? "Close-up mode enabled. Move slowly and tap the label to focus."
          : "Close-up mode disabled.",
      );
      triggerHaptic([10, 20, 10]);
    } catch {
      setMessage("Close-up focus control is not supported by this device.");
    }
  }

  function getTouchDistance(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) return null;
    const [first, second] = [event.touches[0], event.touches[1]];
    return Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    );
  }

  function handlePinchStart(event: React.TouchEvent<HTMLDivElement>) {
    const distance = getTouchDistance(event);
    if (!distance) return;
    pinchDistanceRef.current = distance;
    pinchStartZoomRef.current = zoom;
  }

  function handlePinchMove(event: React.TouchEvent<HTMLDivElement>) {
    const distance = getTouchDistance(event);
    const startDistance = pinchDistanceRef.current;
    if (!distance || !startDistance) return;

    event.preventDefault();
    const scale = distance / startDistance;
    void setZoomLevel(pinchStartZoomRef.current * scale);
  }

  function handlePinchEnd() {
    pinchDistanceRef.current = null;
  }

  async function toggleFacingCamera() {
    if (starting || recording || focusLocked) return;

    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    stopCamera();

    window.setTimeout(() => {
      void startCamera(next);
    }, 120);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;

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

  async function setZoomLevel(nextValue: number) {
    const next = Math.max(zoomMin, Math.min(zoomMax, nextValue));
    setZoom(next);

    if (!hardwareZoomRef.current) return;

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ zoom: next } as any],
      });
    } catch {
      hardwareZoomRef.current = false;
    }
  }

  async function handleTapFocus(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (starting || recording) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    setFocusPoint({ x, y });
    setFocusMessage("Focusing…");

    const track = streamRef.current?.getVideoTracks()[0];

    try {
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { focusMode?: string[] })
        | undefined;

      if (track && Array.isArray(capabilities?.focusMode)) {
        const mode = capabilities.focusMode.includes("single-shot")
          ? "single-shot"
          : capabilities.focusMode.includes("continuous")
            ? "continuous"
            : "";

        if (mode) {
          await track.applyConstraints({
            advanced: [{ focusMode: mode } as any],
          });
          setFocusMessage("Focus adjusted");
        } else {
          setFocusMessage("Continuous focus active");
        }
      } else {
        setFocusMessage("Continuous focus active");
      }
    } catch {
      setFocusMessage("Continuous focus active");
    }

    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }

    focusTimerRef.current = window.setTimeout(() => {
      setFocusPoint(null);
      setFocusMessage("");
      focusTimerRef.current = null;
    }, 1400);
  }

  async function capturePhoto() {
    const video = videoRef.current;

    // This is called directly from a tap, which keeps Web Audio allowed on iOS.
    triggerHaptic(22);
    void playPhotoShutterSound();

    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("Camera frame is not ready yet.");
      return;
    }

    const maxWidth = 1920;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      setMessage("Could not capture the photo.");
      return;
    }

    if (!hardwareZoomRef.current && zoom > 1) {
      const sourceWidth = video.videoWidth / zoom;
      const sourceHeight = video.videoHeight / zoom;
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

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setMessage("Could not create the photo file.");
      return;
    }

    const file = new File([blob], `field-photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    onAddMedia([file]);
    setSessionCaptureCount((current) => current + 1);
    if (autoSaveGallery) {
      void saveFileToDeviceGallery(file).catch(() => false);
    }
    setMessage("Photo added. Keep capturing or close the camera.");
  }

  function chooseRecorderMimeType() {
    const choices = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    return choices.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function startRecording() {
    const stream = streamRef.current;

    if (!allowVideo) {
      setMessage("Video is not available for this destination.");
      return;
    }

    if (!stream || typeof MediaRecorder === "undefined") {
      setMessage(
        "Video recording is not supported here. Use Choose Videos instead.",
      );
      return;
    }

    try {
      chunksRef.current = [];
      const mimeType = chooseRecorderMimeType();
      // When muted, record a video-only stream so the clip has no audio track.
      const recordStream = muteAudio
        ? new MediaStream(stream.getVideoTracks())
        : stream;
      const recorder = new MediaRecorder(recordStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 10_000_000,
        ...(muteAudio ? {} : { audioBitsPerSecond: 128_000 }),
      });

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        stopRecordingTimer();
        setRecordingSeconds(0);
        setRecording(false);
        setMessage("Video recording failed. Use Choose Videos instead.");
      };

      recorder.onstop = () => {
        stopRecordingTimer();
        setRecordingSeconds(0);
        triggerHaptic(28);
        void playRecordStopSound();

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });

        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);

        if (!blob.size) {
          setMessage("The recorded video was empty.");
          return;
        }

        const extension = blob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File(
          [blob],
          `field-video-${Date.now()}.${extension}`,
          {
            type: blob.type || "video/webm",
            lastModified: Date.now(),
          },
        );

        onAddMedia([file]);
        setSessionCaptureCount((current) => current + 1);
        if (autoSaveGallery) {
          void saveFileToDeviceGallery(file).catch(() => false);
        }
        setMessage("Video added. Keep capturing or close the camera.");
      };

      recorderRef.current = recorder;

      // Play the start cue before recording begins so it is not captured by
      // the video's microphone track.
      triggerHaptic([20, 30, 20]);
      await playRecordStartSound();
      await new Promise((resolve) => window.setTimeout(resolve, 90));

      recorder.start(500);
      startRecordingTimer();
      setRecording(true);
      setMessage("Recording… Tap the red button again to stop.");
    } catch {
      setMessage(
        "Video recording is not supported here. Use Choose Videos instead.",
      );
    }
  }

  function toggleRecording() {
    if (recording) {
      try {
        recorderRef.current?.stop();
      } catch {}
      return;
    }

    void startRecording();
  }

  function handlePrimaryCapture() {
    if (captureMode === "video") {
      toggleRecording();
      return;
    }

    void capturePhoto();
  }

  const card = !open ? (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
        Field Camera
      </p>
      <h2 className="mt-1 text-xl font-black">Photo + Video Camera</h2>
      <p className="mt-1 text-sm text-slate-300">
        Open once and switch between Photo and Video without closing the camera.
        Media is added to <strong>{destinationLabel}</strong>.
      </p>

      {allowVideo && (
        <button
          type="button"
          onClick={() => setMuteAudio((current) => !current)}
          className={`mt-3 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-black transition [touch-action:manipulation] ${
            muteAudio
              ? "border-red-400/60 bg-red-500/10 text-red-200"
              : "border-slate-600 bg-black/30 text-slate-200"
          }`}
        >
          <span>{muteAudio ? "🔇 Video sound: Off" : "🎤 Video sound: On"}</span>
          <span className="text-xs font-bold opacity-70">
            Tap to {muteAudio ? "unmute" : "mute"}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={async () => {
          setSessionCaptureCount(0);
          setCameraError("");
          setMessage("");

          if (nativeCameraAvailable()) {
            setStarting(true);

            try {
              const files = await openNativeFieldCamera({
                allowVideo,
                autoSaveGallery,
                preferredMode: captureMode,
                muteAudio,
              });

              // Closing or cancelling the native camera is a normal result.
              // Never open the legacy web camera after the native camera closes.
              if (files.length === 0) {
                setMessage("Field Camera closed.");
                return;
              }

              try {
                onAddMedia(files);
              } catch (addError: any) {
                throw new Error(
                  addError?.message ||
                    "The captured media could not be added to the Field Tool.",
                );
              }

              setSessionCaptureCount(files.length);
              setMessage(
                `${files.length} native camera item${files.length === 1 ? "" : "s"} added.`,
              );
            } catch (error: any) {
              setOpen(false);
              setCameraError(
                error?.message ||
                  "The native camera could not return the captured media.",
              );
            } finally {
              setStarting(false);
            }

            return;
          }

          // The web camera is used only outside a native Capacitor app.
          setOpen(true);
          window.setTimeout(() => void startCamera(facingMode), 50);
        }}
        className="mt-4 min-h-[48px] w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-black transition active:scale-[0.98] hover:bg-cyan-300 [touch-action:manipulation]"
      >
        {starting ? "Opening Camera..." : "📸 Open Field Camera"}
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
          hardwareZoomRef.current || zoom <= 1
            ? undefined
            : {
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
              }
        }
      />

      <div
        className="absolute inset-0 z-[1]"
        onPointerDown={handleTapFocus}
        onTouchStart={handlePinchStart}
        onTouchMove={handlePinchMove}
        onTouchEnd={handlePinchEnd}
        aria-label="Tap to focus or pinch to zoom"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80" />

      {focusPoint && (
        <div
          className="pointer-events-none absolute z-20 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-yellow-300 shadow-[0_0_18px_rgba(253,224,71,0.7)]"
          style={{
            left: `${focusPoint.x * 100}%`,
            top: `${focusPoint.y * 100}%`,
          }}
        >
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300" />
        </div>
      )}

      {focusMessage && (
        <div className="pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-black text-yellow-200 backdrop-blur">
          {focusMessage}
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            if (!recording) setOpen(false);
          }}
          disabled={recording}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-2xl text-white backdrop-blur disabled:opacity-40"
        >
          ✕
        </button>

        <div className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/65 px-3 py-2 text-center backdrop-blur">
          <p className="truncate text-sm font-black text-white">
            {destinationLabel}
          </p>
          <p className="text-[11px] font-bold text-cyan-200">
            {selectedMediaCount} selected · {sessionCaptureCount} this session
          </p>
        </div>

        {recording ? (
          <div className="flex h-12 min-w-[88px] items-center justify-center gap-2 rounded-full bg-red-600 px-3 text-sm font-black text-white shadow-xl">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            {formatRecordingTime(recordingSeconds)}
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-xl backdrop-blur ${
              torchOn ? "bg-yellow-300 text-black" : "bg-black/65 text-white"
            }`}
          >
            ⚡
          </button>
        )}
      </div>

      <div className="absolute left-4 top-[calc(max(1rem,env(safe-area-inset-top))+4.25rem)] z-30 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleFocusLock}
          className={`rounded-full px-3 py-2 text-xs font-black backdrop-blur ${
            focusLocked
              ? "bg-yellow-300 text-black"
              : "bg-black/65 text-white"
          }`}
        >
          {focusLocked ? "🔒 FOCUS" : "🎯 FOCUS"}
        </button>

        <button
          type="button"
          onClick={toggleMacroMode}
          className={`rounded-full px-3 py-2 text-xs font-black backdrop-blur ${
            macroMode ? "bg-cyan-300 text-black" : "bg-black/65 text-white"
          }`}
        >
          🔍 CLOSE-UP
        </button>

        <button
          type="button"
          onClick={() => setAutoSaveGallery((current) => !current)}
          className={`rounded-full px-3 py-2 text-xs font-black backdrop-blur ${
            autoSaveGallery
              ? "bg-emerald-300 text-black"
              : "bg-black/65 text-white"
          }`}
        >
          {autoSaveGallery ? "✓ GALLERY" : "GALLERY OFF"}
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 max-w-[680px]">
          <input
            type="range"
            min={zoomMin}
            max={zoomMax}
            step={0.1}
            value={zoom}
            onChange={(event) => void setZoomLevel(Number(event.target.value))}
            className="w-full accent-yellow-300"
            aria-label="Camera zoom"
          />
        </div>

        <div className="mx-auto mb-3 grid max-w-[260px] grid-cols-2 rounded-full border border-white/15 bg-black/70 p-1 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              if (!recording) setCaptureMode("photo");
            }}
            disabled={recording}
            className={`rounded-full px-5 py-2 text-xs font-black ${
              captureMode === "photo" ? "bg-white text-black" : "text-white"
            } disabled:opacity-40`}
          >
            PHOTO
          </button>

          <button
            type="button"
            onClick={() => {
              if (allowVideo) setCaptureMode("video");
            }}
            disabled={!allowVideo}
            className={`rounded-full px-5 py-2 text-xs font-black ${
              captureMode === "video" ? "bg-red-500 text-white" : "text-white"
            } disabled:opacity-35`}
          >
            VIDEO
          </button>
        </div>

        {message && (
          <div className="mx-auto mb-3 max-w-[680px] rounded-xl bg-black/70 px-4 py-2 text-center text-xs font-bold text-white backdrop-blur">
            {message}
          </div>
        )}

        {cameraError && (
          <div className="mx-auto mb-3 max-w-[680px] rounded-xl border border-red-400/60 bg-red-950/85 px-4 py-3 text-center text-sm font-bold text-red-100">
            {cameraError}
          </div>
        )}

        <div className="mx-auto flex max-w-[680px] items-end justify-between gap-4">
          <button
            type="button"
            onClick={toggleFacingCamera}
            disabled={recording}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 text-2xl text-white backdrop-blur disabled:opacity-40"
          >
            🔄
          </button>

          <button
            type="button"
            onClick={handlePrimaryCapture}
            disabled={starting}
            aria-label={
              captureMode === "video"
                ? recording
                  ? "Stop recording"
                  : "Start recording"
                : "Take photo"
            }
            className={`h-[86px] w-[86px] rounded-full border-[6px] border-white shadow-2xl active:scale-95 disabled:opacity-50 ${
              captureMode === "video"
                ? recording
                  ? "bg-red-600 ring-4 ring-red-400 animate-pulse"
                  : "bg-red-500 ring-4 ring-red-400"
                : "bg-white ring-4 ring-cyan-400"
            }`}
          >
            {captureMode === "video" && recording && (
              <span className="mx-auto block h-7 w-7 rounded-md bg-white" />
            )}
          </button>

          {captureMode === "video" ? (
            <button
              type="button"
              onClick={() => setMuteAudio((current) => !current)}
              disabled={recording}
              aria-label={muteAudio ? "Unmute microphone" : "Mute microphone"}
              title={muteAudio ? "Sound off — recording video only" : "Sound on"}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl backdrop-blur disabled:opacity-40 ${
                muteAudio ? "bg-red-600/80 text-white" : "bg-black/65 text-white"
              }`}
            >
              {muteAudio ? "🔇" : "🎤"}
            </button>
          ) : (
            <div className="h-14 w-14" />
          )}
        </div>
      </div>
    </div>
  );

  if (!open || typeof document === "undefined") return card;

  return createPortal(card, document.body);
}
