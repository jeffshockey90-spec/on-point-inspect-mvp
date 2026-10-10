"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  addOfflineQueueItem,
  processOfflineQueue,
  isOnline,
} from "../lib/offline/queue";
import { flushAllDrafts } from "../lib/offline/draftQueue";
import {
  buildEquipmentSavePayload,
  type EquipmentResult,
} from "../lib/equipment/equipmentSave";
import { uploadFindingMediaFile } from "../lib/uploadFindingMedia";
import { supabase } from "../lib/supabaseClient";
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
  // Existing findings in THIS report, so the camera can offer "Combine with an
  // existing defect". Loaded lazily on open (RLS scopes it to the owner).
  const [existingFindings, setExistingFindings] = useState<any[]>([]);

  async function loadExistingFindings() {
    try {
      const { data } = await supabase
        .from("findings")
        .select("id, title, section, observation, location, severity")
        .eq("inspection_id", inspectionId)
        .not("needs_review", "is", true)
        .order("section", { ascending: true })
        .order("created_at", { ascending: true });
      setExistingFindings(Array.isArray(data) ? data : []);
    } catch {
      /* combine just won't be offered */
    }
  }

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
    void loadExistingFindings(); // for "Combine with an existing defect"
    setOpen(true);
  }

  // Combine a new capture into an EXISTING finding (same as the field tool): add
  // the photo(s) to that finding and, when a draft is provided, AI-rewrite it to
  // cover both locations. Carries the capture's compass location so the merged
  // write-up can enumerate every affected spot.
  async function handleAttachToExisting(
    findingId: string,
    files: File[],
    draft?: Record<string, any>,
  ) {
    if (!findingId || !files?.length) return;
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFindingMediaFile(inspectionId, String(findingId), file);
    }
    if (draft) {
      try {
        await fetch("/api/findings/combine-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionId,
            findingId,
            newFinding: {
              title: draft.title || "",
              section: draft.section || "",
              severity: draft.severity || "",
              observation: draft.observation || "",
              implication: draft.implication || "",
              recommendation: draft.recommendation || "",
              location: draft.location || "",
            },
          }),
        });
      } catch {
        /* photos are attached; the AI rewrite is best-effort */
      }
    }
    notifyChanged();
  }

  // Closing the camera: send any un-approved background drafts to the builder's
  // review queue (needs_review) so nothing is stranded on this device, then
  // refresh so the review panel the inspector lands on shows them immediately.
  function closeCamera() {
    setOpen(false);
    void flushAllDrafts(inspectionId)
      .then((n) => {
        if (n > 0) {
          if (isOnline()) void processOfflineQueue().then(notifyChanged).catch(() => {});
          else notifyChanged();
        }
      })
      .catch(() => {});
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

    if (category === "equipment" && draft.kind === "equipment") {
      // The launcher doesn't CAPTURE equipment, but the shared draft queue can
      // surface an equipment draft started in the field tool; approve it here
      // too (same mapping the field tool uses) rather than dead-ending.
      const { inventory, inventory_base, create_finding, finding } =
        buildEquipmentSavePayload(
          draft as unknown as EquipmentResult,
          "",
          inspectionId,
        );
      const queued = await addOfflineQueueItem({
        type: "equipment",
        payload: {
          inspection_id: inspectionId,
          inventory,
          inventory_base,
          create_finding,
          finding,
          confirmed_live: true,
          offline_created_at: new Date().toISOString(),
        },
        media: files,
      });
      if (!queued) {
        throw new Error("This device can't save offline — reconnect to save this equipment.");
      }
      if (isOnline()) void processOfflineQueue().then(notifyChanged).catch(() => {});
      else notifyChanged();
      return;
    }

    throw new Error("Unsupported capture type.");
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
          onClose={closeCamera}
          categories={["finding", "limitation", "reference"]}
          selectedReport={inspectionId}
          currentSection={sections[0] || ""}
          currentSeverity="Recommended Repair"
          sections={sections}
          existingFindings={existingFindings}
          onAttachToExisting={handleAttachToExisting}
          onAccept={handleAccept}
        />
      )}
    </>
  );
}
