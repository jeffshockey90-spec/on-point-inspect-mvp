// The ONE AI-draft generator for the live camera, shared by the synchronous
// path (components/AILiveInspectionCamera runDraft) and the background worker
// (lib/offline/draftQueue generateDraftForItem). Keeping both on this single
// function means the finding/limitation/equipment request bodies and the draft
// shapes can never drift apart between the two paths.
//
// It takes already-prepared inputs (aiFrames already shrunk, files already in
// hand) and returns { draft, baseline }. It never touches saved-photo bytes —
// aiFrames are throwaway inputs for the vision model only.

import { fetchWithRetry } from "../aiFrame";

export type LiveDraftCategory = "finding" | "limitation" | "equipment";

export type LiveDraftInputs = {
  note: string;
  inspectionId: string;
  /** The capture's section (currentSection). Used for finding + limitation. */
  section: string;
  availableSections: string[];
  /** Confirmed location (side/level/room). Used for the finding draft. */
  location: string;
  /** Severity: "" for finding (let AI choose), currentSeverity for limitation. */
  severity: string;
  /** Pre-shrunk AI frame data-URLs (finding/limitation). */
  aiFrames: string[];
  /** Full-res files (equipment multipart). */
  files: File[];
};

export async function generateLiveDraft(
  category: LiveDraftCategory,
  inp: LiveDraftInputs,
): Promise<{ draft: Record<string, any>; baseline: Record<string, any> | null }> {
  if (category === "finding") {
    const res = await fetchWithRetry("/api/ai-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        note: inp.note,
        inspectionId: inp.inspectionId,
        section: inp.section,
        availableSections: inp.availableSections,
        // Confirmed location — a stated FACT for the model, not inferred.
        location: inp.location,
        // Let the AI choose severity from the evidence, not the field's value.
        severity: "",
        images: inp.aiFrames,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "AI could not draft this finding.");
    return {
      draft: {
        kind: "finding",
        title: data.title,
        section: data.section,
        severity: data.severity,
        observation: data.observation,
        implication: data.implication,
        recommendation: data.recommendation,
        confidence: data.confidence,
        sectionInfo: data.sectionInfo || {},
        location: inp.location,
      },
      baseline: {
        title: data.title || "",
        section: data.section || "",
        severity: data.severity || "",
        observation: data.observation || "",
        implication: data.implication || "",
        recommendation: data.recommendation || "",
      },
    };
  }

  if (category === "limitation") {
    const res = await fetchWithRetry("/api/ai/live-inspection-camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        imageDataUrl: inp.aiFrames[0] || "",
        inspectionId: inp.inspectionId,
        currentSection: inp.section,
        currentSeverity: inp.severity,
        availableSections: inp.availableSections,
        focus: "limitation",
        note: inp.note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "AI could not draft this limitation.");
    const lim = data.limitation || {};
    return {
      draft: {
        kind: "limitation",
        title: lim.title || inp.note || "Inspection Limitation",
        section: lim.section || inp.section,
        limitation: lim.limitation || inp.note || "",
        reason: lim.reason || "",
        recommendation: lim.recommendation || "",
        confidence: lim.confidence,
      },
      baseline: null,
    };
  }

  // equipment — multipart with the full-res angle files
  const formData = new FormData();
  for (const f of inp.files) formData.append("images", f);
  if (inp.files[0]) formData.append("image", inp.files[0]);
  formData.append("inspectionId", inp.inspectionId);
  formData.append("inspection_id", inp.inspectionId);
  if (inp.note.trim()) formData.append("note", inp.note.trim());

  const res = await fetchWithRetry("/api/analyze-equipment", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || "AI could not analyze this equipment.");
  return { draft: { ...data, kind: "equipment" }, baseline: null };
}
