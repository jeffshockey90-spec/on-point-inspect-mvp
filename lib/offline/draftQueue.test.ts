import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the IndexedDB offline queue, shared with the ./queue mock.
let store: any[] = [];
let idSeq = 0;
// Hoisted so it exists when the (hoisted) vi.mock factory references it.
const { processOfflineQueueMock } = vi.hoisted(() => ({
  processOfflineQueueMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("./db", () => ({
  isIndexedDbAvailable: () => true,
  DRAFT_STATUSES: ["draft_pending", "generating", "needs_review", "draft_failed"],
}));

// The AI generator always fails, so the draft runs out of retries (terminal).
vi.mock("./ai/liveDraftGen", () => ({
  generateLiveDraft: vi.fn().mockRejectedValue(new Error("AI unavailable")),
}));

vi.mock("./aiFrame", () => ({
  fileToDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
  shrinkForAi: vi.fn().mockResolvedValue("data:image/jpeg;base64,BBBB"),
}));

vi.mock("./equipment/equipmentSave", () => ({
  buildEquipmentSavePayload: vi.fn(() => ({
    inventory: {},
    inventory_base: {},
    create_finding: false,
    finding: null,
  })),
}));

vi.mock("./queue", () => ({
  addOfflineQueueItem: vi.fn(async (item: any) => {
    const withId = {
      ...item,
      id: `q${idSeq++}`,
      createdAt: item.createdAt || new Date().toISOString(),
      media: item.media || [],
    };
    store.push(withId);
    return withId;
  }),
  getOfflineQueue: vi.fn(async () => store.slice()),
  updateOfflineQueueItem: vi.fn(async (id: string, updater: any) => {
    const idx = store.findIndex((i) => i.id === id);
    if (idx >= 0) store[idx] = updater(store[idx]);
    return store[idx];
  }),
  removeOfflineQueueItem: vi.fn(async (id: string) => {
    store = store.filter((i) => i.id !== id);
  }),
  processOfflineQueue: processOfflineQueueMock,
}));

import {
  enqueueDraft,
  processDraftQueue,
  getDraftCounts,
} from "./draftQueue";

// Push any backed-off draft back to "due now" so a subsequent processDraftQueue
// pass retries it immediately instead of waiting out the real backoff timer.
function clearBackoff() {
  for (const i of store) {
    if (i.status === "draft_pending") i.nextAttemptAt = undefined;
  }
}

describe("processDraftQueue terminal failure", () => {
  beforeEach(() => {
    store = [];
    idSeq = 0;
    processOfflineQueueMock.mockClear();
  });

  it("flushes a draft to the review queue (not stranded) after it runs out of retries", async () => {
    await enqueueDraft({
      inspectionId: "123",
      category: "finding",
      note: "Cracked flue pipe at water heater",
      section: "Plumbing",
      availableSections: ["Plumbing", "Exterior"],
      location: "Garage",
      severity: "Safety Concern",
      // Pre-shrunk frames present so the worker doesn't rebuild from media.
      aiFrames: ["data:image/jpeg;base64,AAAA"],
      files: [
        {
          kind: "image",
          bytes: new Uint8Array([1, 2, 3, 4]).buffer,
          type: "image/jpeg",
          name: "shot1.jpg",
        } as any,
      ],
    });

    // Each pass makes one attempt, then backs off; clear the backoff between
    // passes so the three attempts (MAX_DRAFT_RETRIES) happen deterministically.
    await processDraftQueue();
    clearBackoff();
    await processDraftQueue();
    clearBackoff();
    await processDraftQueue();

    // The original draft must NOT be left stranded as a failed local-only draft.
    const counts = await getDraftCounts("123");
    expect(counts.failed).toBe(0);
    expect(counts.pending).toBe(0);
    expect(counts.generating).toBe(0);

    // It should now be a normal queued finding headed for the builder's review
    // queue: confirmed_live:false (→ needs_review) with the inspector's note.
    const queuedFinding = store.find(
      (i) => i.type === "finding" && i.status === "queued",
    );
    expect(queuedFinding).toBeTruthy();
    expect(queuedFinding.payload.confirmed_live).toBe(false);
    expect(queuedFinding.payload.inspection_id).toBe("123");
    expect(queuedFinding.payload.note).toContain("Cracked flue pipe");
    expect(queuedFinding.media.length).toBe(1);

    // And a sync was kicked so it reaches the server promptly.
    expect(processOfflineQueueMock).toHaveBeenCalled();
  });
});
