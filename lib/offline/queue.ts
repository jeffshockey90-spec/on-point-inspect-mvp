/**
 * IndexedDB-backed offline sync queue.
 *
 * This mirrors the public surface of `lib/offlineSyncQueue.ts` as closely as
 * practical, but:
 *  - every read/write is async (IndexedDB is async), and
 *  - media is stored as real Blobs (no 6-item cap, videos supported), and
 *    only converted Blob -> base64 at send time so the POST body stays
 *    compatible with `app/api/offline-ai-sync/route.ts`.
 *
 * SSR / build safe: no IndexedDB access at import time; every function no-ops
 * (returning empty/null) when there is no browser database.
 */

import {
  getDb,
  createId,
  mediaKindForType,
  isIndexedDbAvailable,
  QUEUE_STORE,
  type OfflineQueueRecord,
  type OfflineQueueItemType,
  type OfflineQueueStatus,
  type OfflineMediaEntry,
} from "./db";
import {
  dispatchInspectionDataChanged,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "../inspectionEvents";

export type {
  OfflineQueueRecord,
  OfflineQueueItemType,
  OfflineQueueStatus,
  OfflineMediaEntry,
} from "./db";

/**
 * Public-facing queue item. Alias of the stored record so call sites can use
 * the same name they used with the old module (`OfflineQueueItem`).
 */
export type OfflineQueueItem = OfflineQueueRecord;

export type OfflineSyncResult = {
  ok: boolean;
  synced: number;
  failed: number;
  remaining: number;
  offline: boolean;
  syncedItems: Array<{ item: OfflineQueueItem; result?: any }>;
  failedItems: Array<{ item: OfflineQueueItem; error: string }>;
};

const QUEUE_CHANGE_EVENT = "on-point-offline-queue-change";
const AUTO_SYNC_LOCK_KEY = "on_point_offline_idb_sync_running";

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let processingQueue = false;

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function notifyQueueChange() {
  const win = safeWindow();
  if (!win) return;
  win.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT));
}

export function isOnline(): boolean {
  const win = safeWindow();
  if (!win || typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// ---------------------------------------------------------------------------
// Media helpers (File/Blob -> stored entry, Blob -> base64 at send time)
// ---------------------------------------------------------------------------

export type OfflineMediaInput =
  | File
  | Blob
  | {
      blob: Blob;
      name?: string;
      type?: string;
      lastModified?: number;
    };

/**
 * Normalize an incoming File/Blob into a stored media entry. Bytes are kept as
 * a Blob; no base64, no size cap, images and videos alike.
 */
export function toMediaEntry(input: OfflineMediaInput): OfflineMediaEntry {
  const blob: Blob = input instanceof Blob ? input : input.blob;
  const asFile = input instanceof File ? input : null;
  const bag = input instanceof Blob ? {} : (input as any);

  const type = String(
    (asFile && asFile.type) || bag.type || blob.type || "application/octet-stream",
  );
  const name = String(
    (asFile && asFile.name) || bag.name || `offline-media-${Date.now()}`,
  );
  const lastModified = Number(
    (asFile && asFile.lastModified) || bag.lastModified || Date.now(),
  );

  return {
    id: createId("media"),
    name,
    type,
    size: Number(blob.size || 0),
    lastModified,
    kind: mediaKindForType(type),
    blob,
  };
}

/** Read a Blob as a base64 `data:` URL (used only at send time). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to read media blob."));
    };
    reader.onerror = () => reject(new Error("Unable to read media blob."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build the `photos` array the sync endpoint expects (base64 objects), from the
 * Blob-backed media entries. This matches the old `OfflinePhoto` shape so
 * `app/api/offline-ai-sync/route.ts` needs no changes.
 */
async function mediaEntriesToPhotoPayloads(media: OfflineMediaEntry[]) {
  return Promise.all(
    media.map(async (entry) => ({
      name: entry.name,
      type: entry.type,
      size: entry.size,
      lastModified: entry.lastModified,
      base64: await blobToDataUrl(entry.blob),
    })),
  );
}

// ---------------------------------------------------------------------------
// CRUD — async mirrors of the old localStorage functions
// ---------------------------------------------------------------------------

/**
 * List all queue items, newest first (matches old ordering where new items were
 * prepended). Returns `[]` on the server / when IndexedDB is unavailable.
 */
export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAll(QUEUE_STORE);
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Number of items in the queue (cheap count). */
export async function getOfflineQueueCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  return db.count(QUEUE_STORE);
}

/** Fetch a single item by id, or `null`. */
export async function getOfflineQueueItem(
  id: string,
): Promise<OfflineQueueItem | null> {
  const db = await getDb();
  if (!db) return null;
  return (await db.get(QUEUE_STORE, id)) ?? null;
}

/**
 * Add an item to the queue. Mirrors the old `addOfflineQueueItem`, but accepts
 * raw File/Blob media (stored as Blobs) instead of pre-encoded base64 in
 * `payload.photos`. No cap; images and videos both accepted.
 *
 * `payload` should carry the non-media fields the sync endpoint reads
 * (inspection_id, title, section, severity, notes, skip counters, ...).
 */
export async function addOfflineQueueItem({
  type,
  payload,
  media = [],
  id,
}: {
  type: OfflineQueueItemType;
  payload: Record<string, any>;
  media?: OfflineMediaInput[];
  /** Optional explicit id (for idempotency); defaults to a new UUID. */
  id?: string;
}): Promise<OfflineQueueItem | null> {
  const now = new Date().toISOString();
  const record: OfflineQueueRecord = {
    id: id || createId(),
    type,
    payload: payload || {},
    media: (media || []).map(toMediaEntry),
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "queued",
  };

  const db = await getDb();
  if (!db) return null;

  await db.put(QUEUE_STORE, record);
  notifyQueueChange();
  return record;
}

/** Remove an item by id. */
export async function removeOfflineQueueItem(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(QUEUE_STORE, id);
  notifyQueueChange();
}

/** Clear the whole queue. */
export async function clearOfflineQueue(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.clear(QUEUE_STORE);
  notifyQueueChange();
}

/**
 * Apply an updater to a single item and persist it. Mirrors the old
 * `updateOfflineQueueItem`, but async and read-modify-write inside one txn.
 */
export async function updateOfflineQueueItem(
  id: string,
  updater: (item: OfflineQueueItem) => OfflineQueueItem,
): Promise<OfflineQueueItem | null> {
  const db = await getDb();
  if (!db) return null;

  const tx = db.transaction(QUEUE_STORE, "readwrite");
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return null;
  }
  const next = updater(current);
  await tx.store.put(next);
  await tx.done;
  notifyQueueChange();
  return next;
}

/** Convenience: set an item's status (+ updatedAt). */
export async function setOfflineQueueItemStatus(
  id: string,
  status: OfflineQueueStatus,
  extra: Partial<OfflineQueueRecord> = {},
): Promise<OfflineQueueItem | null> {
  return updateOfflineQueueItem(id, (current) => ({
    ...current,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Record a failed attempt with exponential backoff. Uses the same formula as
 * the old queue: capped at 15 minutes, 5s * 2^(retry-1).
 */
export async function markOfflineQueueItemFailed(
  id: string,
  message: string,
): Promise<OfflineQueueItem | null> {
  return updateOfflineQueueItem(id, (current) => {
    const retryCount = Number(current.retryCount || 0) + 1;
    const backoffMs = Math.min(
      15 * 60 * 1000,
      5000 * 2 ** Math.min(8, retryCount - 1),
    );
    return {
      ...current,
      retryCount,
      status: "failed",
      updatedAt: new Date().toISOString(),
      nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
      lastError: message,
    };
  });
}

// ---------------------------------------------------------------------------
// Summary (mirrors old getOfflineQueueSummary; now Blob-aware)
// ---------------------------------------------------------------------------

export async function getOfflineQueueSummary() {
  const queue = await getOfflineQueue();

  const totalBytes = queue.reduce((sum, item) => {
    const mediaBytes = (item.media || []).reduce(
      (mSum, m) => mSum + Number(m.size || 0),
      0,
    );
    return sum + mediaBytes;
  }, 0);

  const photoCount = queue.reduce(
    (sum, item) =>
      sum + (item.media || []).filter((m) => m.kind === "image").length,
    0,
  );
  const videoCount = queue.reduce(
    (sum, item) =>
      sum + (item.media || []).filter((m) => m.kind === "video").length,
    0,
  );

  const findingCount = queue.filter((item) => item.type === "finding").length;
  const referencePhotoCount = queue.filter(
    (item) => item.type === "reference_photo",
  ).length;
  const skippedMediaCount = queue.reduce(
    (sum, item) => sum + Number(item.payload?.offline_media_skipped_count || 0),
    0,
  );
  const skippedVideoCount = queue.reduce(
    (sum, item) => sum + Number(item.payload?.offline_video_skipped_count || 0),
    0,
  );
  const failedCount = queue.filter((item) => item.lastError).length;
  const conflictCount = queue.filter((item) => item.status === "conflict").length;
  const syncingCount = queue.filter((item) => item.status === "syncing").length;

  return {
    count: queue.length,
    findingCount,
    referencePhotoCount,
    photoCount,
    videoCount,
    failedCount,
    conflictCount,
    syncingCount,
    skippedMediaCount,
    skippedVideoCount,
    bytes: totalBytes,
    megabytes: Number((totalBytes / 1024 / 1024).toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
// Send: build a POST body compatible with /api/offline-ai-sync
// ---------------------------------------------------------------------------

/**
 * Produce the exact JSON body the sync endpoint expects for one item:
 * `{ id, type, createdAt, payload: { ...payload, photos: base64[] } }`.
 * Blob -> base64 conversion happens here (send time), never at store time.
 */
export async function buildSyncBody(item: OfflineQueueItem) {
  const photos = await mediaEntriesToPhotoPayloads(item.media || []);
  return {
    id: item.id,
    type: item.type,
    createdAt: item.createdAt,
    payload: {
      ...item.payload,
      photos,
    },
  };
}

// ---------------------------------------------------------------------------
// Auto-sync lock (session-scoped, mirrors old behavior)
// ---------------------------------------------------------------------------

function setAutoSyncLock(active: boolean) {
  const win = safeWindow();
  if (!win) return;
  try {
    if (active) win.sessionStorage.setItem(AUTO_SYNC_LOCK_KEY, "1");
    else win.sessionStorage.removeItem(AUTO_SYNC_LOCK_KEY);
  } catch {}
}

function hasAutoSyncLock() {
  const win = safeWindow();
  if (!win) return false;
  try {
    return win.sessionStorage.getItem(AUTO_SYNC_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Processing (mirrors old processOfflineQueue, async + Blob-aware)
// ---------------------------------------------------------------------------

export async function processOfflineQueue({
  onItemSynced,
  onItemFailed,
}: {
  onItemSynced?: (item: OfflineQueueItem, result?: any) => void;
  onItemFailed?: (item: OfflineQueueItem, error: any) => void;
} = {}): Promise<OfflineSyncResult & { busy?: boolean }> {
  const syncedItems: OfflineSyncResult["syncedItems"] = [];
  const failedItems: OfflineSyncResult["failedItems"] = [];

  if (!isIndexedDbAvailable()) {
    return {
      ok: true,
      synced: 0,
      failed: 0,
      remaining: 0,
      offline: false,
      syncedItems,
      failedItems,
    };
  }

  if (!isOnline()) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      remaining: await getOfflineQueueCount(),
      offline: true,
      syncedItems,
      failedItems,
    };
  }

  if (processingQueue || hasAutoSyncLock()) {
    return {
      ok: true,
      synced: 0,
      failed: 0,
      remaining: await getOfflineQueueCount(),
      offline: false,
      busy: true,
      syncedItems,
      failedItems,
    };
  }

  processingQueue = true;
  setAutoSyncLock(true);

  const now = Date.now();
  // Oldest first (createdAt ascending) so items sync in the order captured.
  const queue = (await getOfflineQueue())
    .filter((item) => {
      if (item.status === "conflict") return false;
      const nextAttempt = item.nextAttemptAt
        ? new Date(item.nextAttemptAt).getTime()
        : 0;
      return !Number.isFinite(nextAttempt) || nextAttempt <= now;
    })
    .slice()
    .reverse();

  let synced = 0;
  let failed = 0;

  try {
    for (const item of queue) {
      try {
        await setOfflineQueueItemStatus(item.id, "syncing", {
          lastError: undefined,
        });

        const body = await buildSyncBody(item);

        const res = await fetch("/api/offline-ai-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          const conflictMessage =
            data.error || "A newer server version was detected.";
          await setOfflineQueueItemStatus(item.id, "conflict", {
            lastError: conflictMessage,
            conflict: data.conflict || data,
          });
          failed += 1;
          failedItems.push({ item, error: conflictMessage });
          onItemFailed?.(item, new Error(conflictMessage));
          continue;
        }

        if (!res.ok) {
          throw new Error(data.error || "Offline item sync failed.");
        }

        await removeOfflineQueueItem(item.id);
        synced += 1;
        syncedItems.push({ item, result: data });
        onItemSynced?.(item, data);
      } catch (error: any) {
        const message = error?.message || "Sync failed.";
        failed += 1;
        await markOfflineQueueItemFailed(item.id, message);
        failedItems.push({ item, error: message });
        onItemFailed?.(item, error);
      }
    }
  } finally {
    processingQueue = false;
    setAutoSyncLock(false);
  }

  const remaining = await getOfflineQueueCount();

  if (synced > 0) {
    const grouped = new Map<
      string,
      { inspectionId: string; section?: string; types: Set<string> }
    >();

    for (const syncedItem of syncedItems) {
      const inspectionId = String(
        syncedItem.item.payload?.inspectionId ||
          syncedItem.item.payload?.inspection_id ||
          "",
      );
      const section =
        String(syncedItem.item.payload?.section || "") || undefined;
      const key = `${inspectionId}:${section || ""}`;
      const current = grouped.get(key) || {
        inspectionId,
        section,
        types: new Set<string>(),
      };
      current.types.add(syncedItem.item.type);
      grouped.set(key, current);
    }

    for (const group of grouped.values()) {
      dispatchInspectionDataChanged({
        inspectionId: group.inspectionId || undefined,
        section: group.section,
        source: "offline-sync",
        types: Array.from(group.types),
        synced,
        failed,
        remaining,
      });
    }

    const win = safeWindow();
    win?.dispatchEvent(
      new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, {
        detail: { synced, failed, remaining, source: "offline-sync" },
      }),
    );
  }

  return {
    ok: failed === 0,
    synced,
    failed,
    remaining,
    offline: false,
    syncedItems,
    failedItems,
  };
}

// ---------------------------------------------------------------------------
// Auto-sync loop (mirrors old startOfflineQueueAutoSync)
// ---------------------------------------------------------------------------

export function startOfflineQueueAutoSync({
  intervalMs = 30000,
  onSynced,
  onFailed,
}: {
  intervalMs?: number;
  onSynced?: (result: Awaited<ReturnType<typeof processOfflineQueue>>) => void;
  onFailed?: (error: any) => void;
} = {}) {
  const win = safeWindow();
  if (!win) return () => undefined;

  async function runOnce() {
    if (!isOnline()) return;
    if ((await getOfflineQueueCount()) === 0) return;

    try {
      const result = await processOfflineQueue();
      onSynced?.(result);
    } catch (error) {
      onFailed?.(error);
    }
  }

  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") void runOnce();
  }

  win.addEventListener("online", runOnce);
  win.addEventListener("focus", runOnce);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  autoSyncTimer = setInterval(runOnce, intervalMs);

  void runOnce();

  return () => {
    win.removeEventListener("online", runOnce);
    win.removeEventListener("focus", runOnce);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  };
}

/** The custom event name dispatched on any queue mutation. */
export const OFFLINE_QUEUE_CHANGE_EVENT = QUEUE_CHANGE_EVENT;
