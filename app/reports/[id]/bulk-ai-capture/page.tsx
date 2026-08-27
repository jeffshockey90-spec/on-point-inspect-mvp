"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { createFullImageForUpload } from "../../../../lib/imageVariants";

const MAX_PHOTOS = 25;

const DEFAULT_BULK_AI_GUIDANCE =
  "Identify the main inspection defect in each photo. Do not create findings for background items. Keep each photo to one finding only. Use the inspector note as the primary issue when provided. If plumbing is the main concern, route to Plumbing. If electrical is the main concern, route to Electrical. If roof covering, shingles, flashing, or roof penetration is the main concern, route to Roof. If siding, trim, grading, decks, porches, exterior doors, or exterior penetrations are the main concern, route to Exterior. Be conservative, realtor-friendly, and do not exaggerate.";

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
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Maintenance",
  "Monitor",
  "Informational",
];

type BulkItem = {
  id: string;
  file: File;
  previewUrl: string;
  note: string;
  status: "ready" | "analyzing" | "review" | "saving" | "saved" | "error";
  error: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  equipmentType: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  estimatedAge: string;
  notes: string;
  aiOriginalTitle: string;
  aiOriginalSection: string;
  aiOriginalSeverity: string;
  aiOriginalObservation: string;
  aiOriginalImplication: string;
  aiOriginalRecommendation: string;
  savedFindingId: string;
  savedImageUrl: string;
  savedFilePath: string;
  mergedIntoId: string;
};

type ProposedMerge = {
  sourceId: string;
  targetId: string;
  confidence: number;
  reason: string;
};

function makeItem(file: File): BulkItem {
  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    note: "",
    status: "ready",
    error: "",
    title: "",
    section: "Exterior",
    severity: "Recommended Repair",
    observation: "",
    implication: "",
    recommendation: "",
    equipmentType: "",
    manufacturer: "",
    modelNumber: "",
    serialNumber: "",
    estimatedAge: "",
    notes: "",
    aiOriginalTitle: "",
    aiOriginalSection: "",
    aiOriginalSeverity: "",
    aiOriginalObservation: "",
    aiOriginalImplication: "",
    aiOriginalRecommendation: "",
    savedFindingId: "",
    savedImageUrl: "",
    savedFilePath: "",
    mergedIntoId: "",
  };
}

export default function BulkAICapturePage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = String(params?.id || "");

  const [items, setItems] = useState<BulkItem[]>([]);
  const [globalNote, setGlobalNote] = useState(DEFAULT_BULK_AI_GUIDANCE);
  const [aiMemory, setAiMemory] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposedMerges, setProposedMerges] = useState<ProposedMerge[]>([]);
  const [showMergePreview, setShowMergePreview] = useState(false);

  useEffect(() => {
    try {
      const savedMemory = window.localStorage.getItem("onpoint_bulk_ai_memory") || "";
      if (savedMemory) setAiMemory(savedMemory);
    } catch {}
  }, []);

  function saveAIMemory() {
    try {
      window.localStorage.setItem("onpoint_bulk_ai_memory", aiMemory);
      alert("Bulk AI guidance memory saved on this device.");
    } catch {
      alert("Could not save AI guidance memory on this device.");
    }
  }

  const savedCount = useMemo(
    () => items.filter((item) => item.status === "saved").length,
    [items]
  );

  const reviewCount = useMemo(
    () => items.filter((item) => item.status === "review" && !item.mergedIntoId).length,
    [items]
  );

  const mergedCount = useMemo(
    () => items.filter((item) => item.mergedIntoId).length,
    [items]
  );

  function updateItem(id: string, patch: Partial<BulkItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (selected.length === 0) {
      alert("Please select photo or video files.");
      return;
    }

    setProposedMerges([]);
    setShowMergePreview(false);

    const limited = selected.slice(0, MAX_PHOTOS);
    setItems(limited.map(makeItem));
  }

  async function analyzeOne(item: BulkItem) {
    updateItem(item.id, {
      status: "analyzing",
      error: "",
      mergedIntoId: "",
    });

    try {
      if (item.file.type.startsWith("video/")) {
        updateItem(item.id, {
          status: "review",
          title: item.title || "Video Attachment",
          section: item.section || "Exterior",
          severity: "Informational",
          observation:
            item.observation ||
            "Video media was added to document the condition observed at the time of inspection.",
          implication:
            item.implication ||
            "Video is provided for client reference and additional visual context.",
          recommendation:
            item.recommendation ||
            "Review the attached video along with the written finding. Further evaluation or repair should be performed by the appropriate qualified contractor if concerns are present.",
          aiOriginalTitle: item.title || "Video Attachment",
          aiOriginalSection: item.section || "Exterior",
          aiOriginalSeverity: "Informational",
          aiOriginalObservation:
            item.observation ||
            "Video media was added to document the condition observed at the time of inspection.",
          aiOriginalImplication:
            item.implication ||
            "Video is provided for client reference and additional visual context.",
          aiOriginalRecommendation:
            item.recommendation ||
            "Review the attached video along with the written finding. Further evaluation or repair should be performed by the appropriate qualified contractor if concerns are present.",
        });
        return;
      }

      const base64 = await fileToBase64(item.file);

      const combinedNote = [
        DEFAULT_BULK_AI_GUIDANCE,
        aiMemory.trim(),
        globalNote.trim(),
        item.note.trim(),
      ]
        .filter(Boolean)
        .join("\n\n");

      const res = await fetch("/api/ai-photo-finding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mode: "inspection",
          inspectorNote: combinedNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI analysis failed.");
      }

      const correctedSection = autoCorrectSection(
        data.section,
        [
          data.title,
          data.observation,
          data.implication,
          data.recommendation,
          item.note,
          globalNote,
          aiMemory,
        ].join(" ")
      );

      const cleanSection = SECTIONS.includes(correctedSection)
        ? correctedSection
        : "Exterior";

      const cleanSeverity = SEVERITIES.includes(data.severity)
        ? data.severity
        : "Recommended Repair";

      const cleanTitle = data.title || "Inspection Finding";

      updateItem(item.id, {
        status: "review",
        title: cleanTitle,
        section: cleanSection,
        severity: cleanSeverity,
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
        equipmentType: data.equipment_type || "",
        manufacturer: data.manufacturer || "",
        modelNumber: data.model_number || "",
        serialNumber: data.serial_number || "",
        estimatedAge: data.estimated_age || "",
        notes: data.notes || "",
        aiOriginalTitle: cleanTitle,
        aiOriginalSection: data.section || cleanSection,
        aiOriginalSeverity: cleanSeverity,
        aiOriginalObservation: data.observation || "",
        aiOriginalImplication: data.implication || "",
        aiOriginalRecommendation: data.recommendation || "",
        mergedIntoId: "",
      });
    } catch (error: any) {
      updateItem(item.id, {
        status: "error",
        error: error?.message || "Failed to analyze photo.",
      });
    }
  }

  async function analyzeAll() {
    if (items.length === 0 || busy) return;

    setBusy(true);
    setProposedMerges([]);
    setShowMergePreview(false);

    const snapshot = [...items];

    for (const item of snapshot) {
      if (item.status === "saved") continue;
      await analyzeOne(item);
    }

    setBusy(false);
  }

  function previewAutoMergeSimilarFindings() {
    const reviewItems = items.filter(
      (item) =>
        item.status === "review" &&
        !item.file.type.startsWith("video/") &&
        !item.mergedIntoId &&
        item.title.trim()
    );

    if (reviewItems.length < 2) {
      alert("You need at least two reviewed photo findings before merging.");
      return;
    }

    const proposals: ProposedMerge[] = [];
    const targetBySource = new Set<string>();

    for (let i = 0; i < reviewItems.length; i++) {
      const source = reviewItems[i];

      if (targetBySource.has(source.id)) continue;

      let bestTarget: BulkItem | null = null;
      let bestScore = 0;
      let bestReason = "";

      for (let j = 0; j < i; j++) {
        const target = reviewItems[j];

        if (!target || target.id === source.id) continue;
        if (targetBySource.has(target.id)) continue;
        if (target.section !== source.section) continue;

        const score = titleSimilarity(target.title, source.title);

        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestReason =
            score >= 0.95
              ? "Same section and nearly identical title"
              : "Same section and similar title";
        }
      }

      if (bestTarget && bestScore >= 0.72) {
        proposals.push({
          sourceId: source.id,
          targetId: bestTarget.id,
          confidence: bestScore,
          reason: bestReason,
        });

        targetBySource.add(source.id);
      }
    }

    if (proposals.length === 0) {
      alert("No strong merge matches found. You can still manually move photos after saving.");
      return;
    }

    setProposedMerges(proposals);
    setShowMergePreview(true);
  }

  function confirmMergeProposal() {
    if (proposedMerges.length === 0) return;

    setItems((current) =>
      current.map((item) => {
        const proposal = proposedMerges.find((merge) => merge.sourceId === item.id);

        if (!proposal) return item;

        return {
          ...item,
          mergedIntoId: proposal.targetId,
          error: "",
        };
      })
    );

    setShowMergePreview(false);
    alert("Merge plan applied. Review the merged cards, then save all reviewed findings.");
  }

  function clearMergePlan() {
    setProposedMerges([]);
    setShowMergePreview(false);

    setItems((current) =>
      current.map((item) => ({
        ...item,
        mergedIntoId: "",
      }))
    );
  }

  async function saveOne(item: BulkItem) {
    if (item.mergedIntoId) {
      updateItem(item.id, {
        status: "error",
        error:
          "This photo is marked to merge into another finding. Save the main finding instead.",
      });
      return;
    }

    if (!inspectionId) {
      updateItem(item.id, {
        status: "error",
        error: "Missing inspection ID. Open Bulk AI Capture from inside a report.",
      });
      return;
    }

    if (!item.title.trim()) {
      updateItem(item.id, {
        status: "error",
        error: "Finding title is required before saving.",
      });
      return;
    }

    const mergedChildren = items.filter((child) => child.mergedIntoId === item.id);

    if (item.savedFindingId) {
      updateItem(item.id, { status: "saving", error: "" });

      try {
        const fullRecommendation = buildFullRecommendation(item);

        const { error } = await supabase
          .from("findings")
          .update({
            title: item.title,
            section: item.section,
            severity: item.severity,
            observation: item.observation,
            implication: item.implication,
            recommendation: fullRecommendation,
            image_url: item.file.type.startsWith("image/") ? item.savedImageUrl : "",
          })
          .eq("id", item.savedFindingId)
          .eq("inspection_id", inspectionId);

        if (error) throw error;

        await rememberInspectorCorrection(item);

        updateItem(item.id, { status: "saved", error: "" });
      } catch (error: any) {
        updateItem(item.id, {
          status: "error",
          error: error?.message || "Failed to update saved finding.",
        });
      }

      return;
    }

    updateItem(item.id, { status: "saving", error: "" });

    try {
      const uploadItems = [item, ...mergedChildren];

      const uploadedFiles: {
        item: BulkItem;
        imageUrl: string;
        filePath: string;
      }[] = [];

      for (let index = 0; index < uploadItems.length; index++) {
        const uploadItem = uploadItems[index];

        const uploaded = await uploadMediaFile(inspectionId, uploadItem.file, index);

        uploadedFiles.push({
          item: uploadItem,
          imageUrl: uploaded.imageUrl,
          filePath: uploaded.filePath,
        });
      }

      const primaryUpload = uploadedFiles[0];

      const fullRecommendation = buildFullRecommendation(item);

      const { data: findingData, error } = await supabase
        .from("findings")
        .insert({
          inspection_id: inspectionId,
          title: item.title,
          section: item.section,
          severity: item.severity,
          observation: item.observation,
          implication: item.implication,
          recommendation: fullRecommendation,
          image_url: item.file.type.startsWith("image/") ? primaryUpload?.imageUrl || "" : "",
        })
        .select()
        .single();

      if (error) throw error;

      if (findingData) {
        const photoRows = uploadedFiles.map((uploaded) => ({
          inspection_id: inspectionId,
          finding_id: findingData.id,
          public_url: uploaded.imageUrl,
          file_path: uploaded.filePath,
        }));

        const { error: photoError } = await supabase.from("photos").insert(photoRows);

        if (photoError) throw photoError;
      }

      await rememberInspectorCorrection(item);

      for (const child of mergedChildren) {
        await rememberInspectorCorrection(child);
      }

      setItems((current) =>
        current.map((currentItem) => {
          if (
            currentItem.id === item.id ||
            mergedChildren.some((child) => child.id === currentItem.id)
          ) {
            const matchingUpload = uploadedFiles.find(
              (uploaded) => uploaded.item.id === currentItem.id
            );

            return {
              ...currentItem,
              status: "saved",
              error: "",
              savedFindingId: findingData?.id || "",
              savedImageUrl: matchingUpload?.imageUrl || "",
              savedFilePath: matchingUpload?.filePath || "",
            };
          }

          return currentItem;
        })
      );
    } catch (error: any) {
      updateItem(item.id, {
        status: "error",
        error: error?.message || "Failed to save finding.",
      });
    }
  }

  async function saveAllReviewed() {
    if (busy) return;

    setBusy(true);

    const snapshot = items.filter((item) => item.status === "review" && !item.mergedIntoId);

    for (const item of snapshot) {
      await saveOne(item);
    }

    // Teach the per-inspector learning brain from each reviewed item's AI draft
    // vs. the final accepted values. Fire-and-forget batch; must never slow or
    // block the save loop above.
    try {
      await Promise.allSettled(
        snapshot.map((item) =>
          fetch("/api/ai/learning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inspectionId,
              tool: "bulk_capture",
              original: {
                title: item.aiOriginalTitle,
                section: item.aiOriginalSection,
                severity: item.aiOriginalSeverity,
                observation: item.aiOriginalObservation,
                implication: item.aiOriginalImplication,
                recommendation: item.aiOriginalRecommendation,
              },
              updated: {
                title: item.title,
                section: item.section,
                severity: item.severity,
                observation: item.observation,
                implication: item.implication,
                recommendation: item.recommendation,
              },
              accepted: true,
              notes:
                "Inspector accepted an AI-generated finding. Learn wording, severity, and section-routing preferences from the before/after.",
            }),
          }).catch(() => {}),
        ),
      );
    } catch {
      // Learning must never block saving.
    }

    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
              FLOW AI
            </p>

            <h1 className="mt-2 text-4xl font-extrabold">Bulk AI Capture</h1>

            <p className="mt-3 max-w-3xl text-[var(--fl-muted)]">
              Upload multiple inspection photos or videos. Review each AI finding,
              preview similar finding merges, then save clean grouped findings to the report.
            </p>
          </div>

          <Link
            href={inspectionId ? `/reports/${inspectionId}` : "/reports"}
            className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            Back To Report
          </Link>
        </div>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6">
          <h2 className="mb-5 text-2xl font-bold text-[var(--fl-accent-text)]">Upload Photos</h2>

          <MediaUploadButtons onChange={handleFileChange} />

          <textarea
            value={globalNote}
            onChange={(e) => setGlobalNote(e.target.value)}
            rows={4}
            placeholder="Optional note for all photos..."
            className="mt-5 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />

          <div className="mt-5 rounded-2xl border border-purple-800 bg-purple-500/10 p-4">
            <h3 className="text-lg font-extrabold text-[var(--fl-purple-text)]">AI Guidance Memory</h3>

            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Optional saved guidance for how you want Bulk AI Capture to write and route findings on this device.
            </p>

            <textarea
              value={aiMemory}
              onChange={(e) => setAiMemory(e.target.value)}
              rows={4}
              placeholder="Example: Always keep findings concise. Route sink, drain, supply, toilet, tub, shower, water heater, and visible leaks to Plumbing."
              className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-purple-400"
            />

            <button
              type="button"
              onClick={saveAIMemory}
              className="mt-3 rounded-xl border border-purple-500 px-5 py-2 font-bold text-[var(--fl-purple-text)] hover:bg-purple-500/10"
            >
              Save AI Guidance Memory
            </button>
          </div>

          <p className="mt-4 rounded-xl border border-teal-800 bg-teal-500/10 p-3 text-sm text-teal-100">
            Tip: Analyze all photos first. Then click Auto Merge Similar Findings to preview which photos will be grouped together before saving.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={analyzeAll}
              disabled={items.length === 0 || busy}
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
            >
              {busy ? "Working..." : "Analyze All Photos"}
            </button>

            <button
              onClick={previewAutoMergeSimilarFindings}
              disabled={busy || items.filter((i) => i.status === "review").length < 2}
              className="rounded-xl bg-cyan-600 px-6 py-3 font-bold text-white transition hover:bg-cyan-500 disabled:opacity-50"
            >
              Auto Merge Similar Findings
            </button>

            <button
              onClick={saveAllReviewed}
              disabled={reviewCount === 0 || busy}
              className="rounded-xl bg-purple-600 px-6 py-3 font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              Save All Reviewed Findings
            </button>

            <button
              onClick={clearMergePlan}
              disabled={busy || mergedCount === 0}
              className="rounded-xl border border-yellow-600 px-6 py-3 font-bold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10 disabled:opacity-50"
            >
              Clear Merge Plan
            </button>

            <button
              onClick={() => router.push(`/reports/${inspectionId}`)}
              disabled={!inspectionId || busy}
              className="rounded-xl border border-[var(--fl-line)] px-6 py-3 font-bold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] disabled:opacity-50"
            >
              Return to Report
            </button>
          </div>

          <p className="mt-4 text-sm text-[var(--fl-muted)]">
            Selected media: {items.length} / {MAX_PHOTOS} · Ready to save: {reviewCount} · Merged into other findings: {mergedCount} · Saved: {savedCount}
          </p>
        </section>

        {showMergePreview && proposedMerges.length > 0 && (
          <MergePreviewPanel
            items={items}
            proposedMerges={proposedMerges}
            onConfirm={confirmMergeProposal}
            onCancel={() => setShowMergePreview(false)}
          />
        )}

        {items.length > 0 && (
          <section className="space-y-5">
            {items.map((item, index) => {
              const mergedIntoItem = items.find((target) => target.id === item.mergedIntoId);
              const mergedChildren = items.filter((child) => child.mergedIntoId === item.id);

              return (
                <PhotoReviewCard
                  key={item.id}
                  index={index}
                  item={item}
                  mergedIntoItem={mergedIntoItem}
                  mergedChildren={mergedChildren}
                  updateItem={updateItem}
                  analyzeOne={analyzeOne}
                  saveOne={saveOne}
                  busy={busy}
                />
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function MediaUploadButtons({
  onChange,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-bold text-[var(--fl-accent-text)] hover:bg-teal-500 hover:text-black">
        📷 Take Photos
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black">
        🖼 Choose Photos
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      <label className="cursor-pointer rounded-xl border border-purple-500 bg-purple-500/10 p-4 text-center font-bold text-purple-300 hover:bg-purple-500 hover:text-white">
        🎥 Choose Videos
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={onChange}
          className="hidden"
        />
      </label>

      <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-muted)] md:col-span-3">
        Photos can be analyzed by AI. Videos are saved to the report as media attachments and can be reviewed by the client.
      </p>
    </div>
  );
}

function MergePreviewPanel({
  items,
  proposedMerges,
  onConfirm,
  onCancel,
}: {
  items: BulkItem[];
  proposedMerges: ProposedMerge[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  function findItem(id: string) {
    return items.find((item) => item.id === id);
  }

  return (
    <section className="rounded-2xl border border-cyan-700 bg-cyan-500/10 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--fl-info-text)]">Review Merge Plan</h2>

          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            Nothing has merged yet. Review these matches, then confirm if they look correct.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Confirm Merge
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {proposedMerges.map((merge, index) => {
          const source = findItem(merge.sourceId);
          const target = findItem(merge.targetId);

          if (!source || !target) return null;

          return (
            <div
              key={`${merge.sourceId}-${merge.targetId}`}
              className="rounded-xl border border-cyan-800 bg-[var(--fl-surface-2)] p-4"
            >
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                Merge Match {index + 1} · {Math.round(merge.confidence * 100)}% confidence
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <MergeMiniCard label="This photo" item={source} />

                <MergeMiniCard label="Will merge into" item={target} />
              </div>

              <p className="mt-3 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-sm text-[var(--fl-muted)]">
                Reason: {merge.reason}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MergeMiniCard({
  label,
  item,
}: {
  label: string;
  item: BulkItem;
}) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      {item.file.type.startsWith("video/") ? (
        <video
          src={item.previewUrl}
          controls
          className="mb-3 h-40 w-full rounded-lg bg-[var(--fl-surface-2)] object-contain"
        />
      ) : (
        <img
          src={item.previewUrl}
          alt={item.title}
          className="mb-3 h-40 w-full rounded-lg object-contain"
        />
      )}

      <p className="font-semibold text-[var(--fl-text)]">{item.title}</p>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">{item.section}</p>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">{item.severity}</p>
    </div>
  );
}

function PhotoReviewCard({
  index,
  item,
  mergedIntoItem,
  mergedChildren,
  updateItem,
  analyzeOne,
  saveOne,
  busy,
}: {
  index: number;
  item: BulkItem;
  mergedIntoItem?: BulkItem;
  mergedChildren: BulkItem[];
  updateItem: (id: string, patch: Partial<BulkItem>) => void;
  analyzeOne: (item: BulkItem) => Promise<void>;
  saveOne: (item: BulkItem) => Promise<void>;
  busy: boolean;
}) {
  const isMergedChild = !!item.mergedIntoId;

  return (
    <div
      className={`rounded-2xl border bg-[var(--fl-surface)] p-5 ${
        isMergedChild ? "border-cyan-700 ring-1 ring-cyan-700/60" : "border-[var(--fl-raised)]"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-[var(--fl-accent-text)]">
            {item.file.type.startsWith("video/") ? "Video" : "Photo"} {index + 1}
          </h3>

          <p className="text-sm text-[var(--fl-muted)]">{item.file.name}</p>
        </div>

        <StatusBadge status={item.status} />
      </div>

      {isMergedChild && mergedIntoItem && (
        <div className="mb-5 rounded-xl border border-cyan-700 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
            This photo will merge into:
          </p>

          <p className="mt-2 text-lg font-semibold text-[var(--fl-text)]">{mergedIntoItem.title}</p>

          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            Section: {mergedIntoItem.section} · Severity: {mergedIntoItem.severity}
          </p>
        </div>
      )}

      {mergedChildren.length > 0 && (
        <div className="mb-5 rounded-xl border border-cyan-700 bg-cyan-500/10 p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
            Photos merging into this finding:
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {mergedChildren.map((child, childIndex) => (
              <div key={child.id} className="rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2">
                <img
                  src={child.previewUrl}
                  alt={`Merged photo ${childIndex + 1}`}
                  className="h-28 w-full rounded-md object-contain"
                />

                <p className="mt-2 line-clamp-2 text-xs font-bold text-[var(--fl-muted)]">
                  {child.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div>
          {item.file.type.startsWith("video/") ? (
            <video
              src={item.previewUrl}
              controls
              className="max-h-[320px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
            />
          ) : (
            <img
              src={item.previewUrl}
              alt={`Preview ${index + 1}`}
              className="max-h-[320px] w-full rounded-xl border border-[var(--fl-line)] object-contain"
            />
          )}

          <textarea
            value={item.note}
            onChange={(e) => updateItem(item.id, { note: e.target.value })}
            rows={4}
            disabled={isMergedChild}
            placeholder="Optional note for this photo..."
            className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => analyzeOne(item)}
              disabled={
                busy ||
                isMergedChild ||
                item.status === "analyzing" ||
                item.status === "saving"
              }
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {item.file.type.startsWith("video/") ? "Prepare Video" : "Re-Analyze"}
            </button>

            <button
              onClick={() => saveOne(item)}
              disabled={busy || isMergedChild || item.status !== "review"}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              Save Finding
            </button>

            {isMergedChild && (
              <button
                type="button"
                onClick={() => updateItem(item.id, { mergedIntoId: "" })}
                disabled={busy}
                className="rounded-lg border border-yellow-500 px-4 py-2 text-sm font-bold text-[var(--fl-warn-text)] hover:bg-yellow-500/10 disabled:opacity-50"
              >
                Unmerge
              </button>
            )}
          </div>

          {item.error && (
            <p className="mt-3 rounded-lg border border-red-800 bg-red-500/10 p-3 text-sm text-[var(--fl-crit-text)]">
              {item.error}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <input
            value={item.title}
            onChange={(e) => updateItem(item.id, { title: e.target.value })}
            disabled={isMergedChild}
            placeholder="Finding title"
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={item.section}
              onChange={(e) => updateItem(item.id, { section: e.target.value })}
              disabled={isMergedChild}
              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
            >
              {SECTIONS.map((section) => (
                <option key={section}>{section}</option>
              ))}
            </select>

            <select
              value={item.severity}
              onChange={(e) => updateItem(item.id, { severity: e.target.value })}
              disabled={isMergedChild}
              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
            >
              {SEVERITIES.map((severity) => (
                <option key={severity}>{severity}</option>
              ))}
            </select>
          </div>

          <MiniTextArea
            label="Observation"
            value={item.observation}
            disabled={isMergedChild}
            onChange={(value) => updateItem(item.id, { observation: value })}
          />

          <MiniTextArea
            label="Implication"
            value={item.implication}
            disabled={isMergedChild}
            onChange={(value) => updateItem(item.id, { implication: value })}
          />

          <MiniTextArea
            label="Recommendation"
            value={item.recommendation}
            disabled={isMergedChild}
            onChange={(value) => updateItem(item.id, { recommendation: value })}
          />

          {(item.equipmentType ||
            item.manufacturer ||
            item.modelNumber ||
            item.serialNumber ||
            item.estimatedAge ||
            item.notes) && (
            <div className="rounded-xl border border-blue-800 bg-blue-500/10 p-4">
              <h4 className="mb-3 font-bold text-[var(--fl-info-text)]">Equipment Data</h4>

              <div className="grid gap-3 md:grid-cols-2">
                <SmallInput
                  label="Equipment Type"
                  value={item.equipmentType}
                  disabled={isMergedChild}
                  onChange={(value) => updateItem(item.id, { equipmentType: value })}
                />

                <SmallInput
                  label="Manufacturer"
                  value={item.manufacturer}
                  disabled={isMergedChild}
                  onChange={(value) => updateItem(item.id, { manufacturer: value })}
                />

                <SmallInput
                  label="Model Number"
                  value={item.modelNumber}
                  disabled={isMergedChild}
                  onChange={(value) => updateItem(item.id, { modelNumber: value })}
                />

                <SmallInput
                  label="Serial Number"
                  value={item.serialNumber}
                  disabled={isMergedChild}
                  onChange={(value) => updateItem(item.id, { serialNumber: value })}
                />

                <SmallInput
                  label="Estimated Age"
                  value={item.estimatedAge}
                  disabled={isMergedChild}
                  onChange={(value) => updateItem(item.id, { estimatedAge: value })}
                />
              </div>

              <MiniTextArea
                label="Equipment Notes"
                value={item.notes}
                disabled={isMergedChild}
                onChange={(value) => updateItem(item.id, { notes: value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BulkItem["status"] }) {
  const labelMap: Record<BulkItem["status"], string> = {
    ready: "Ready",
    analyzing: "Analyzing",
    review: "Ready To Review",
    saving: "Saving",
    saved: "Saved",
    error: "Needs Attention",
  };

  return (
    <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-1 text-sm font-bold text-[var(--fl-text)]">
      {labelMap[status]}
    </span>
  );
}

function MiniTextArea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <textarea
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
      />
    </label>
  );
}

function SmallInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-60"
      />
    </label>
  );
}

async function rememberInspectorCorrection(item: BulkItem) {
  const sectionChanged = item.aiOriginalSection && item.aiOriginalSection !== item.section;

  const severityChanged = item.aiOriginalSeverity && item.aiOriginalSeverity !== item.severity;

  if (!sectionChanged && !severityChanged) return;

  const triggerText = [item.note, item.title, item.observation]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);

  if (!triggerText.trim()) return;

  try {
    await fetch("/api/ai-inspector-memory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggerText,
        title: item.title,
        aiSection: item.aiOriginalSection,
        correctedSection: item.section,
        aiSeverity: item.aiOriginalSeverity,
        correctedSeverity: item.severity,
        source: "bulk-ai-capture",
      }),
    });
  } catch {}
}

function buildFullRecommendation(item: BulkItem) {
  return [
    item.recommendation,
    item.equipmentType ? `\n\nEquipment Type: ${item.equipmentType}` : "",
    item.manufacturer ? `Manufacturer: ${item.manufacturer}` : "",
    item.modelNumber ? `Model Number: ${item.modelNumber}` : "",
    item.serialNumber ? `Serial Number: ${item.serialNumber}` : "",
    item.estimatedAge ? `Estimated Age: ${item.estimatedAge}` : "",
    item.notes ? `Additional Notes: ${item.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function uploadMediaFile(inspectionId: string, file: File, index: number) {
  const uploadFile = file.type.startsWith("image/")
    ? await createFullImageForUpload(file)
    : file;

  const originalExt = uploadFile.name.split(".").pop() || "jpg";
  const safeBaseName = safeFileName(uploadFile.name);
  const filePath = `${inspectionId}/${Date.now()}-${index}-${crypto.randomUUID()}-${safeBaseName}.${originalExt}`;

  const { error: uploadError } = await supabase.storage
    .from("inspection-photos")
    .upload(filePath, uploadFile);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("inspection-photos").getPublicUrl(filePath);

  return {
    imageUrl: data.publicUrl,
    filePath,
  };
}

async function fileToBase64(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only photos can be analyzed by AI.");
  }

  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImageFromDataUrl(originalDataUrl);

    const maxDimension = 1600;

    const scale = Math.min(
      1,
      maxDimension /
        Math.max(
          image.naturalWidth || image.width,
          image.naturalHeight || image.height
        )
    );

    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));

    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to process image for AI.");
    }

    ctx.drawImage(image, 0, 0, width, height);

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.82);

    if (!jpegDataUrl || !jpegDataUrl.startsWith("data:image/jpeg;base64,")) {
      throw new Error("Unable to convert image to JPEG.");
    }

    return jpegDataUrl;
  } catch {
    if (
      originalDataUrl.startsWith("data:image/jpeg") ||
      originalDataUrl.startsWith("data:image/png") ||
      originalDataUrl.startsWith("data:image/webp")
    ) {
      return originalDataUrl;
    }

    throw new Error(
      "This phone photo format could not be prepared for AI. Try taking a new photo inside the app or choose a JPG/PNG image."
    );
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      if (!result.startsWith("data:image/")) {
        reject(new Error("Invalid image format."));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for processing."));
    image.src = dataUrl;
  });
}

function safeFileName(name: string) {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);
}

function normalizeTitle(title: string) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(the|a|an|and|or|at|to|of|with|on|in|was|were|is|are|noted|observed|visible|appears|possible|defect|condition|issue|damage|damaged)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string) {
  const cleanA = normalizeTitle(a);
  const cleanB = normalizeTitle(b);

  if (!cleanA || !cleanB) return 0;
  if (cleanA === cleanB) return 1;

  const tokensA = new Set(cleanA.split(" ").filter(Boolean));
  const tokensB = new Set(cleanB.split(" ").filter(Boolean));

  const intersection = [...tokensA].filter((token) => tokensB.has(token));
  const union = new Set([...tokensA, ...tokensB]);

  if (union.size === 0) return 0;

  const jaccard = intersection.length / union.size;

  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
    return Math.max(jaccard, 0.82);
  }

  return jaccard;
}

function autoCorrectSection(originalSection: string, text: string) {
  const clean = String(text || "").toLowerCase();

  if (
    /\b(gfci|gfi|outlet|receptacle|breaker|panel|disconnect|wire|wiring|junction|open ground|reverse polarity|double tap|bonding|electrical)\b/.test(
      clean
    )
  ) {
    return "Electrical";
  }

  if (
    /\b(shingle|roof|flashing|ridge|valley|chimney flashing|boot|vent pipe|roof covering|gutter|downspout)\b/.test(
      clean
    )
  ) {
    return "Roof";
  }

  if (
    /\b(sink|toilet|tub|shower|faucet|drain|supply line|trap|leak|plumbing|water heater|hose bib|valve)\b/.test(
      clean
    )
  ) {
    return "Plumbing";
  }

  if (/\b(furnace|boiler|heat pump|air handler|heating|flue|burner|combustion)\b/.test(clean)) {
    return "Heating";
  }

  if (/\b(air conditioner|condenser|cooling|evaporator|refrigerant|ac unit|a\/c)\b/.test(clean)) {
    return "Cooling";
  }

  if (/\b(dishwasher|range|oven|microwave|garbage disposal|appliance)\b/.test(clean)) {
    return "Built-in Appliances";
  }

  if (/\b(attic|insulation|ventilation|soffit vent|ridge vent|bath fan duct)\b/.test(clean)) {
    return "Attic, Insulation & Ventilation";
  }

  if (/\b(window|door|interior|floor|wall|ceiling|trim|cabinet|stair|handrail|guardrail)\b/.test(clean)) {
    return "Doors, Windows & Interior";
  }

  if (/\b(foundation|crawlspace|basement|structure|joist|beam|girder|pier|sill plate|settlement)\b/.test(clean)) {
    return "Basement, Foundation, Crawlspace & Structure";
  }

  if (SECTIONS.includes(originalSection)) return originalSection;

  return "Exterior";
}
