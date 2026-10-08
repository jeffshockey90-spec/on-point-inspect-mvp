"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  addOfflineQueueItem,
  processOfflineQueue,
  isOnline,
} from "../lib/offline/queue";
import type { CaptureCategory, CaptureDraft } from "../lib/ai/captureTypes";

// Lazy-loaded: the camera's heavy code (speech plugin, markup editor, the 2900-
// line component) is NOT in the builder's bundle — it downloads only when the
// inspector taps the button, so the builder's load is unaffected.
const AILiveInspectionCamera = dynamic(
  () => import("./AILiveInspectionCamera"),
  { ssr: false },
);

type Props = {
  inspectionId: string;
  sections: string[];
  /** Button styling + label, so the builder can place it in a button row. */
  className?: string;
  label?: string;
};

// Launch the live camera as a modal from the report builder. Saves into THIS
// inspection (unambiguous — it's the report you're viewing), through the SAME
// durable offline queue the field tool uses. Findings / limitations / reference
// photos only; equipment capture stays in the field tool.
export default function ReportBuilderLiveCamera({
  inspectionId,
  sections,
  className,
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  const [online, setOnlineState] = useState(true);
  // Beta flags, fetched lazily on first open (not on builder load).
  const [flags, setFlags] = useState<{ async: boolean; compass: boolean }>({
    async: false,
    compass: false,
  });
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  useEffect(() => {
    const update = () => setOnlineState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function loadFlags() {
    if (flagsLoaded) return;
    try {
      const [a, c] = await Promise.all([
        fetch("/api/settings/async-draft", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/settings/compass-auto", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setFlags({ async: Boolean(a?.enabled), compass: Boolean(c?.enabled) });
    } catch {
      /* fail-safe: both off */
    } finally {
      setFlagsLoaded(true);
    }
  }

  function openCamera() {
    void loadFlags(); // parallel; camera opens immediately, flags apply on arrival
    setOpen(true);
  }

  function notifyChanged() {
    try {
      window.dispatchEvent(
        new CustomEvent("opi:inspection-data-changed", { detail: { inspectionId } }),
      );
    } catch {
      /* ignore */
    }
  }

  // Durable save — mirrors the field tool's confirmed-live path exactly so the
  // server produces an identical finished finding/limitation (no review-queue).
  async function handleAccept(
    category: CaptureCategory,
    draft: CaptureDraft,
    fileOrFiles: File | File[],
  ) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    if (!files[0]) return;
    const fallbackSection = sections[0] || "Exterior";

    if (category === "finding" && draft.kind === "finding") {
      const section = sections.includes(draft.section) ? draft.section : fallbackSection;
      const queued = await addOfflineQueueItem({
        type: "finding",
        payload: {
          inspection_id: inspectionId,
          title: draft.title || "",
          section,
          severity: draft.severity || "Recommended Repair",
          inspector_note: "",
          note: "",
          caption: draft.title || "",
          observation: draft.observation || "",
          implication: draft.implication || "",
          recommendation: draft.recommendation || "",
          location: (draft as any).location || "",
          run_ai_after_sync: false,
          ai_after_sync: false,
          confirmed_live: true,
          flagged: (draft as any).flagged === true,
          offline_created_at: new Date().toISOString(),
          offline_media_skipped_count: 0,
          offline_video_skipped_count: 0,
        },
        media: files,
      });
      if (!queued) {
        throw new Error("This device can't save offline — reconnect to save this finding.");
      }
      if (isOnline()) void processOfflineQueue().then(notifyChanged).catch(() => {});
      else notifyChanged();
      return;
    }

    if (category === "limitation" && draft.kind === "limitation") {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) {
        throw new Error("Limitations need a photo — retake in PHOTO mode.");
      }
      const section = sections.includes(draft.section) ? draft.section : fallbackSection;
      const queued = await addOfflineQueueItem({
        type: "limitation",
        payload: {
          inspection_id: inspectionId,
          section,
          title: draft.title || "",
          limitation: draft.limitation || "",
          reason: "",
          recommendation: draft.recommendation || "",
          confirmed_live: true,
          run_ai_after_sync: false,
          ai_after_sync: false,
          offline_created_at: new Date().toISOString(),
        },
        media: images,
      });
      if (!queued) {
        throw new Error("This device can't save offline — reconnect to save this limitation.");
      }
      if (isOnline()) void processOfflineQueue().then(notifyChanged).catch(() => {});
      else notifyChanged();
      return;
    }

    // Equipment is restricted out of this launcher; defensive guard.
    throw new Error("Equipment capture is available in the Field Tool.");
  }

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={
          className ||
          "inline-flex items-center gap-2 rounded-xl border border-teal-400/50 bg-teal-500/10 px-4 py-2.5 text-sm font-semibold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500/20 [touch-action:manipulation]"
        }
      >
        {label || "📷 Live Camera"}
      </button>

      {open && (
        <AILiveInspectionCamera
          online={online}
          asyncDraftEnabled={flags.async}
          compassAutoEnable={flags.compass}
          autoStart
          onClose={() => setOpen(false)}
          categories={["finding", "limitation", "reference"]}
          selectedReport={inspectionId}
          currentSection={sections[0] || ""}
          currentSeverity="Recommended Repair"
          sections={sections}
          onAccept={handleAccept}
        />
      )}
    </>
  );
}
