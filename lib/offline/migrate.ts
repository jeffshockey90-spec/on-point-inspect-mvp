/**
 * One-time, non-destructive migration from the old localStorage offline layer
 * into the new IndexedDB stores.
 *
 * Reads the legacy keys written by `lib/offlineSyncQueue.ts` and
 * `lib/offlineInspectionPreload.ts`, imports them into IndexedDB (converting
 * base64 photo payloads back into real Blobs), and records a migration flag in
 * the `meta` store. localStorage is intentionally left intact — the cutover of
 * call sites happens in a later, separate step.
 *
 * SSR/build safe: no IndexedDB or localStorage access at import time.
 */

import {
  getDb,
  META_STORE,
  META_MIGRATION_KEY,
  PRELOAD_STORE,
  QUEUE_STORE,
  mediaKindForType,
  createId,
  isIndexedDbAvailable,
  type OfflineQueueRecord,
  type OfflineMediaEntry,
  type CachedInspection,
  type CachedInspectionPreload,
} from "./db";

// Legacy localStorage keys (must match the old modules exactly).
const OLD_QUEUE_KEY = "on_point_offline_sync_queue";
const OLD_PRELOAD_PREFIX = "opi-offline-inspection-preload";
const OLD_PRELOAD_INDEX_KEY = "opi-offline-inspection-preload-index";
const OLD_LAST_SYNC_NOTICE_KEY = "opi-last-sync-notice";

export type OfflineMigrationResult = {
  ran: boolean;
  alreadyMigrated: boolean;
  queueImported: number;
  preloadImported: number;
  indexImported: number;
  errors: string[];
};

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function readLocalJson<T>(key: string): T | null {
  const win = safeWindow();
  if (!win) return null;
  try {
    const raw = win.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Convert a base64 `data:` URL (or bare base64) into a Blob. Used to turn old
 * `OfflinePhoto.base64` entries back into real Blobs.
 */
// Decode a base64 (or data:) string to raw bytes. We store the ArrayBuffer, not
// a Blob, so migrated media survives an iOS app restart just like freshly
// captured media (see OfflineMediaEntry).
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const commaIdx = base64.indexOf(",");
  const data = commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64;

  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Turn an old base64 photo object into a Blob-backed media entry. */
function oldPhotoToMediaEntry(photo: any): OfflineMediaEntry | null {
  if (!photo?.base64) return null;
  const type = String(photo.type || "image/jpeg");
  let bytes: ArrayBuffer;
  try {
    bytes = base64ToArrayBuffer(photo.base64);
  } catch {
    return null;
  }
  return {
    id: createId("media"),
    name: String(photo.name || `offline-photo-${Date.now()}.jpg`),
    type,
    size: Number(photo.size || bytes.byteLength || 0),
    lastModified: Number(photo.lastModified || Date.now()),
    kind: mediaKindForType(type),
    bytes,
  };
}

/** Old queue item -> new record (base64 photos become Blob media entries). */
function oldQueueItemToRecord(oldItem: any): OfflineQueueRecord | null {
  if (!oldItem?.id || !oldItem?.type) return null;

  const oldPayload = oldItem.payload || {};
  const { photos, ...restPayload } = oldPayload;

  const media = (Array.isArray(photos) ? photos : [])
    .map(oldPhotoToMediaEntry)
    .filter((entry: OfflineMediaEntry | null): entry is OfflineMediaEntry =>
      Boolean(entry),
    );

  return {
    id: String(oldItem.id),
    type: oldItem.type,
    payload: restPayload,
    media,
    createdAt: oldItem.createdAt || new Date().toISOString(),
    updatedAt: oldItem.updatedAt,
    retryCount: Number(oldItem.retryCount || 0),
    status: oldItem.status || "queued",
    nextAttemptAt: oldItem.nextAttemptAt,
    lastError: oldItem.lastError,
    conflict: oldItem.conflict,
    migratedFrom: "localStorage",
  };
}

/**
 * Run the migration once. Idempotent: if the migration flag is already set, it
 * returns early without touching anything. Safe to call on app startup.
 */
export async function migrateOfflineFromLocalStorage(): Promise<OfflineMigrationResult> {
  const result: OfflineMigrationResult = {
    ran: false,
    alreadyMigrated: false,
    queueImported: 0,
    preloadImported: 0,
    indexImported: 0,
    errors: [],
  };

  if (!isIndexedDbAvailable()) return result;

  const db = await getDb();
  if (!db) return result;

  // Idempotency guard.
  const flag = await db.get(META_STORE, META_MIGRATION_KEY);
  if (flag?.migrated) {
    result.alreadyMigrated = true;
    return result;
  }

  result.ran = true;

  // 1) Queue --------------------------------------------------------------
  try {
    const oldQueue = readLocalJson<any[]>(OLD_QUEUE_KEY);
    if (Array.isArray(oldQueue) && oldQueue.length > 0) {
      const tx = db.transaction(QUEUE_STORE, "readwrite");
      for (const oldItem of oldQueue) {
        const record = oldQueueItemToRecord(oldItem);
        if (!record) continue;
        // Do not clobber an item already present (idempotency by id).
        const existing = await tx.store.get(record.id);
        if (existing) continue;
        await tx.store.put(record);
        result.queueImported += 1;
      }
      await tx.done;
    }
  } catch (error: any) {
    result.errors.push(`queue: ${error?.message || "import failed"}`);
  }

  // 2) Reports index ------------------------------------------------------
  try {
    const oldIndex = readLocalJson<CachedInspection[]>(OLD_PRELOAD_INDEX_KEY);
    if (Array.isArray(oldIndex) && oldIndex.length > 0) {
      const { META_REPORTS_INDEX_KEY } = await import("./db");
      await db.put(META_STORE, oldIndex, META_REPORTS_INDEX_KEY);
      result.indexImported = oldIndex.length;
    }
  } catch (error: any) {
    result.errors.push(`index: ${error?.message || "import failed"}`);
  }

  // 3) Per-inspection preload records ------------------------------------
  try {
    const win = safeWindow();
    if (win) {
      const keys: string[] = [];
      for (let i = 0; i < win.localStorage.length; i += 1) {
        const key = win.localStorage.key(i);
        if (
          key &&
          key.startsWith(`${OLD_PRELOAD_PREFIX}-`) &&
          key !== OLD_PRELOAD_INDEX_KEY
        ) {
          keys.push(key);
        }
      }

      if (keys.length > 0) {
        const tx = db.transaction(PRELOAD_STORE, "readwrite");
        for (const key of keys) {
          const record = readLocalJson<CachedInspectionPreload>(key);
          if (!record?.inspectionId) continue;
          const existing = await tx.store.get(record.inspectionId);
          if (existing) continue;
          await tx.store.put(record);
          result.preloadImported += 1;
        }
        await tx.done;
      }
    }
  } catch (error: any) {
    result.errors.push(`preload: ${error?.message || "import failed"}`);
  }

  // 4) Sync-completion notice --------------------------------------------
  try {
    const oldNotice = readLocalJson<any>(OLD_LAST_SYNC_NOTICE_KEY);
    if (oldNotice) {
      const { META_LAST_SYNC_NOTICE_KEY } = await import("./db");
      await db.put(META_STORE, oldNotice, META_LAST_SYNC_NOTICE_KEY);
    }
  } catch (error: any) {
    result.errors.push(`notice: ${error?.message || "import failed"}`);
  }

  // Mark migrated (non-destructive: legacy localStorage is left untouched).
  try {
    await db.put(
      META_STORE,
      {
        migrated: true,
        migratedAt: new Date().toISOString(),
        queueImported: result.queueImported,
        preloadImported: result.preloadImported,
        indexImported: result.indexImported,
      },
      META_MIGRATION_KEY,
    );
  } catch (error: any) {
    result.errors.push(`flag: ${error?.message || "write failed"}`);
  }

  return result;
}

/** Whether the one-time migration has already completed. */
export async function hasMigratedOffline(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const flag = await db.get(META_STORE, META_MIGRATION_KEY);
  return Boolean(flag?.migrated);
}
