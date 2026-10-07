// Background AI-draft queue for the live camera (async "draft while I keep
// shooting" beta). Built on top of the existing offline IndexedDB queue:
//
//  Analyze tap  → enqueueDraft(): a queue item with status "draft_pending",
//                 the full-res media (for the eventual save) + pre-shrunk AI
//                 frames + capture metadata. The inspector returns to the
//                 viewfinder immediately.
//  background   → processDraftQueue(): serial worker; for the oldest pending
//                 item it calls the SAME AI route the live draft uses, then
//                 writes the result back onto the record as status
//                 "needs_review" + draft. Nothing is held only in memory, so a
//                 crash/relaunch just resumes.
//  popup → tap  → loadDraftForApproval(): the camera reopens the draft in its
//                 normal confirm card; Approve saves via the existing path and
//                 calls removeDraft(). No separate upload code.
//
// Draft items are IGNORED by processOfflineQueue (see DRAFT_STATUSES in db.ts),
// so they never sync until approval flips them to "queued" via the normal save.

import { isIndexedDbAvailable, DRAFT_STATUSES, type OfflineQueueItemType } from "./db";
import {
  addOfflineQueueItem,
  getOfflineQueue,
  updateOfflineQueueItem,
  removeOfflineQueueItem,
  type OfflineQueueItem,
  type OfflineMediaInput,
} from "./queue";
import { fetchWithRetry } from "../aiFrame";

export const DRAFT_QUEUE_EVENT = "opi:draft-queue-changed";

const MAX_DRAFT_RETRIES = 3;

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function notifyDraftChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(DRAFT_QUEUE_EVENT));
  } catch {
    /* ignore */
  }
}

export type DraftCategory = "finding" | "limitation" | "equipment";

export type EnqueueDraftInput = {
  inspectionId: string;
  category: DraftCategory;
  note: string;
  section: string;
  availableSections: string[];
  location: string;
  severity: string;
  /** Pre-shrunk AI frame data-URLs (finding/limitation). */
  aiFrames: string[];
  /** Full-res files to save on approval (images + any video). */
  files: OfflineMediaInput[];
  /** A short label for the "draft ready" popup (falls back to the note). */
  label?: string;
};

// Persist a capture for background drafting. Returns the queue item id.
export async function enqueueDraft(input: EnqueueDraftInput): Promise<string | null> {
  const item = await addOfflineQueueItem({
    type: input.category as OfflineQueueItemType,
    status: "draft_pending",
    draftKind: input.category as OfflineQueueItemType,
    media: input.files,
    payload: {
      inspection_id: input.inspectionId,
      async_draft: true,
      category: input.category,
      note: input.note || "",
      section: input.section || "",
      availableSections: input.availableSections || [],
      location: input.location || "",
      severity: input.severity || "",
      aiFrames: input.aiFrames || [],
      label: input.label || input.note || "",
    },
  });
  notifyDraftChange();
  return item?.id || null;
}

// All draft-lifecycle items, optionally scoped to one inspection, newest first.
export async function getDraftItems(inspectionId?: string): Promise<OfflineQueueItem[]> {
  const all = await getOfflineQueue();
  return all.filter(
    (i) =>
      DRAFT_STATUSES.includes(i.status) &&
      (!inspectionId || String(i.payload?.inspection_id || "") === String(inspectionId)),
  );
}

export type DraftCounts = { pending: number; generating: number; ready: number; failed: number };

export async function getDraftCounts(inspectionId?: string): Promise<DraftCounts> {
  const items = await getDraftItems(inspectionId);
  return {
    pending: items.filter((i) => i.status === "draft_pending").length,
    generating: items.filter((i) => i.status === "generating").length,
    ready: items.filter((i) => i.status === "needs_review").length,
    failed: items.filter((i) => i.status === "draft_failed").length,
  };
}

// Rebuild Files from stored media bytes (ArrayBuffer) / legacy blob.
function filesFromItem(item: OfflineQueueItem, imagesOnly = false): File[] {
  const out: File[] = [];
  for (const m of item.media || []) {
    if (imagesOnly && m.kind !== "image") continue;
    let blob: Blob | null = null;
    if (m.bytes) blob = new Blob([m.bytes], { type: m.type || "image/jpeg" });
    else if (m.blob) blob = m.blob;
    if (!blob || blob.size === 0) continue;
    out.push(new File([blob], m.name || "capture.jpg", { type: m.type || "image/jpeg", lastModified: m.lastModified || Date.now() }));
  }
  return out;
}

// Call the same AI route the live draft uses, for one queued capture.
async function generateDraftForItem(
  item: OfflineQueueItem,
): Promise<{ draft: Record<string, any>; baseline: Record<string, any> | null }> {
  const p = item.payload || {};
  const category: DraftCategory = p.category || "finding";
  const aiFrames: string[] = Array.isArray(p.aiFrames) ? p.aiFrames : [];
  const inspectionId = String(p.inspection_id || "");

  if (category === "finding") {
    const res = await fetchWithRetry("/api/ai-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        note: p.note || "",
        inspectionId,
        section: p.section || "",
        availableSections: p.availableSections || [],
        location: p.location || "",
        severity: "",
        images: aiFrames,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "AI could not draft this finding.");
    const draft = {
      kind: "finding",
      title: data.title,
      section: data.section,
      severity: data.severity,
      observation: data.observation,
      implication: data.implication,
      recommendation: data.recommendation,
      confidence: data.confidence,
      sectionInfo: data.sectionInfo || {},
      location: p.location || "",
    };
    const baseline = {
      title: data.title || "",
      section: data.section || "",
      severity: data.severity || "",
      observation: data.observation || "",
      implication: data.implication || "",
      recommendation: data.recommendation || "",
    };
    return { draft, baseline };
  }

  if (category === "limitation") {
    const res = await fetchWithRetry("/api/ai/live-inspection-camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        imageDataUrl: aiFrames[0] || "",
        inspectionId,
        currentSection: p.section || "",
        currentSeverity: p.severity || "",
        availableSections: p.availableSections || [],
        focus: "limitation",
        note: p.note || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "AI could not draft this limitation.");
    const lim = data.limitation || {};
    const draft = {
      kind: "limitation",
      title: lim.title || p.note || "Inspection Limitation",
      section: lim.section || p.section || "",
      limitation: lim.limitation || p.note || "",
      reason: lim.reason || "",
      recommendation: lim.recommendation || "",
      confidence: lim.confidence,
    };
    return { draft, baseline: null };
  }

  // equipment — multipart with the full-res angle files
  const formData = new FormData();
  const files = filesFromItem(item, true);
  for (const f of files) formData.append("images", f);
  if (files[0]) formData.append("image", files[0]);
  formData.append("inspectionId", inspectionId);
  formData.append("inspection_id", inspectionId);
  if (String(p.note || "").trim()) formData.append("note", String(p.note).trim());

  const res = await fetchWithRetry("/api/analyze-equipment", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || "AI could not analyze this equipment.");
  return { draft: { ...data, kind: "equipment" }, baseline: null };
}

let draftWorkerRunning = false;

// Serial background worker. Generates the oldest pending draft, writes the
// result back, and loops. Safe to call repeatedly (single-flight). Needs the
// network; when offline it no-ops and the items wait.
export async function processDraftQueue(): Promise<void> {
  if (!isIndexedDbAvailable() || !isOnline()) return;
  if (draftWorkerRunning) return;
  draftWorkerRunning = true;
  try {
    // Recover any item left "generating" by a crash/reload — the worker is
    // single-flight, so nothing is legitimately generating when it starts.
    for (const stuck of (await getDraftItems()).filter((i) => i.status === "generating")) {
      await updateOfflineQueueItem(stuck.id, (c) => ({ ...c, status: "draft_pending", updatedAt: new Date().toISOString() }));
    }

    // Process until there's nothing due.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!isOnline()) break;
      const now = Date.now();
      const pending = (await getDraftItems())
        .filter((i) => i.status === "draft_pending")
        .filter((i) => {
          const next = i.nextAttemptAt ? new Date(i.nextAttemptAt).getTime() : 0;
          return !Number.isFinite(next) || next <= now;
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const item = pending[0];
      if (!item) break;

      await updateOfflineQueueItem(item.id, (c) => ({ ...c, status: "generating", lastError: undefined, updatedAt: new Date().toISOString() }));
      notifyDraftChange();

      try {
        const { draft, baseline } = await generateDraftForItem(item);
        await updateOfflineQueueItem(item.id, (c) => ({
          ...c,
          status: "needs_review",
          draft,
          aiBaseline: c.aiBaseline || baseline || undefined,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err: any) {
        const message = err?.message || "Draft failed.";
        await updateOfflineQueueItem(item.id, (c) => {
          const retryCount = Number(c.retryCount || 0) + 1;
          if (retryCount >= MAX_DRAFT_RETRIES) {
            return { ...c, status: "draft_failed", retryCount, lastError: message, updatedAt: new Date().toISOString() };
          }
          const backoffMs = Math.min(2 * 60 * 1000, 3000 * 2 ** (retryCount - 1));
          return {
            ...c,
            status: "draft_pending",
            retryCount,
            lastError: message,
            nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
      }
      notifyDraftChange();
    }
  } finally {
    draftWorkerRunning = false;
  }
}

// What the camera needs to reopen a ready draft in its confirm card.
export type LoadedDraft = {
  id: string;
  category: DraftCategory;
  draft: Record<string, any>;
  baseline: Record<string, any> | null;
  files: File[];
  note: string;
  location: string;
  label: string;
};

export async function loadDraftForApproval(id: string): Promise<LoadedDraft | null> {
  const items = await getDraftItems();
  const item = items.find((i) => i.id === id);
  if (!item || !item.draft) return null;
  const p = item.payload || {};
  return {
    id: item.id,
    category: (p.category || "finding") as DraftCategory,
    draft: item.draft,
    baseline: item.aiBaseline || null,
    files: filesFromItem(item),
    note: p.note || "",
    location: p.location || "",
    label: p.label || p.note || "",
  };
}

// Redraft with an inspector nudge: update the note, record the nudge, and push
// the item back to pending so the worker regenerates. The popup reappears when
// the new draft is ready.
export async function requeueDraft(id: string, note: string): Promise<void> {
  await updateOfflineQueueItem(id, (c) => {
    const nudges = Array.isArray(c.nudges) ? c.nudges.slice() : [];
    if (note && note.trim()) nudges.push(note.trim());
    return {
      ...c,
      status: "draft_pending",
      retryCount: 0,
      nextAttemptAt: undefined,
      lastError: undefined,
      draft: undefined,
      nudges,
      payload: { ...c.payload, note: note || c.payload?.note || "" },
      updatedAt: new Date().toISOString(),
    };
  });
  notifyDraftChange();
  void processDraftQueue();
}

// Retry a failed draft (push it back to pending).
export async function retryDraft(id: string): Promise<void> {
  await updateOfflineQueueItem(id, (c) => ({ ...c, status: "draft_pending", retryCount: 0, nextAttemptAt: undefined, lastError: undefined, updatedAt: new Date().toISOString() }));
  notifyDraftChange();
  void processDraftQueue();
}

// Remove a draft item (after it's been approved + saved, or discarded).
export async function discardDraft(id: string): Promise<void> {
  await removeOfflineQueueItem(id);
  notifyDraftChange();
}
