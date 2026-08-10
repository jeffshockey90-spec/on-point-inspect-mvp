/**
 * IndexedDB foundation for the offline layer.
 *
 * This is the Blob-native replacement for the localStorage-based offline
 * modules (`lib/offlineSyncQueue.ts` and `lib/offlineInspectionPreload.ts`).
 * Media (photos AND videos) is stored as real Blobs instead of base64 strings,
 * which removes the old 6-photo-per-finding cap and enables video support.
 *
 * SSR / build safety:
 * - Importing this module never touches IndexedDB. The database is opened
 *   lazily on first real use, and only when a browser + IndexedDB exist.
 * - Every accessor returns `null` when there is no window/IndexedDB, so callers
 *   can no-op safely during Next.js prerender / server rendering and inside a
 *   Node build.
 */

import type { DBSchema, IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfflineQueueItemType = "finding" | "reference_photo";

export type OfflineQueueStatus = "queued" | "syncing" | "failed" | "conflict";

export type OfflineMediaKind = "image" | "video";

/**
 * A single stored media entry. Unlike the old `OfflinePhoto` (which carried a
 * base64 `data:` string), the bytes live in `blob` as a real Blob. Base64 is
 * only produced at send time (see `lib/offline/queue.ts`).
 */
export type OfflineMediaEntry = {
  /** Stable id within the queue item (for de-dup / ordering). */
  id: string;
  name: string;
  /** MIME type, e.g. "image/jpeg" or "video/mp4". */
  type: string;
  size: number;
  lastModified: number;
  kind: OfflineMediaKind;
  /** The real bytes. IndexedDB stores Blobs natively. */
  blob: Blob;
};

/**
 * Queue record as stored in IndexedDB. Mirrors the old `OfflineQueueItem`
 * shape, except media lives in `media` (Blobs) instead of `payload.photos`
 * (base64). `payload` still holds all the non-media fields the sync endpoint
 * needs (inspection_id, title, section, severity, notes, skip counters, ...).
 */
export type OfflineQueueRecord = {
  id: string;
  type: OfflineQueueItemType;
  payload: Record<string, any>;
  media: OfflineMediaEntry[];
  createdAt: string;
  updatedAt?: string;
  retryCount: number;
  status: OfflineQueueStatus;
  nextAttemptAt?: string;
  lastError?: string;
  conflict?: Record<string, any>;
  /** Set when this record was imported from the old localStorage queue. */
  migratedFrom?: "localStorage";
};

/** Reports index entry (mirrors `CachedInspection`). */
export type CachedInspection = {
  id: string;
  label: string;
  client_name?: string;
  client_email?: string;
  address?: string;
  raw?: any;
  cachedAt: string;
};

/** Per-inspection preload record (mirrors `CachedInspectionPreload`). */
export type CachedInspectionPreload = {
  inspectionId: string;
  inspection?: CachedInspection;
  reports: CachedInspection[];
  comments: any[];
  templates: any[];
  sections: string[];
  findings: any[];
  groupedFindings?: any[];
  clientInfo: Record<string, any>;
  reportSnapshot?: Record<string, any>;
  cachedAt: string;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Well-known keys for the small single-value `meta` store. */
export const META_REPORTS_INDEX_KEY = "reports-index";
export const META_MIGRATION_KEY = "localStorage-migrated";
export const META_LAST_SYNC_NOTICE_KEY = "last-sync-notice";

interface OnPointOfflineDB extends DBSchema {
  /** Sync queue: one record per offline action, media stored as Blobs. */
  queue: {
    key: string;
    value: OfflineQueueRecord;
    indexes: {
      by_status: string;
      by_inspection: string;
      by_createdAt: string;
    };
  };
  /** Per-inspection read cache, keyed by inspection id. */
  preload: {
    key: string;
    value: CachedInspectionPreload;
    indexes: {
      by_cachedAt: string;
    };
  };
  /** Small single-value store: reports index, migration flag, sync notice. */
  meta: {
    key: string;
    value: any;
  };
}

export const DB_NAME = "on-point-offline";
export const DB_VERSION = 1;

export const QUEUE_STORE = "queue" as const;
export const PRELOAD_STORE = "preload" as const;
export const META_STORE = "meta" as const;

// ---------------------------------------------------------------------------
// Lazy, SSR-safe open
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<OnPointOfflineDB> | null> | null = null;

/** True only in an environment where IndexedDB is usable. */
export function isIndexedDbAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    indexedDB !== null
  );
}

/**
 * Open (or reuse) the database. Returns `null` on the server, during build, or
 * anywhere IndexedDB is missing. Never called at import time — only on first
 * real use — so Next.js build/prerender never touches IndexedDB.
 */
export async function getDb(): Promise<IDBPDatabase<OnPointOfflineDB> | null> {
  if (!isIndexedDbAvailable()) return null;

  if (!dbPromise) {
    dbPromise = (async () => {
      // Import `idb` lazily so the dependency is only pulled in the browser.
      const { openDB } = await import("idb");

      return openDB<OnPointOfflineDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(QUEUE_STORE)) {
            const queueStore = db.createObjectStore(QUEUE_STORE, {
              keyPath: "id",
            });
            queueStore.createIndex("by_status", "status");
            queueStore.createIndex("by_inspection", "payload.inspection_id");
            queueStore.createIndex("by_createdAt", "createdAt");
          }

          if (!db.objectStoreNames.contains(PRELOAD_STORE)) {
            const preloadStore = db.createObjectStore(PRELOAD_STORE, {
              keyPath: "inspectionId",
            });
            preloadStore.createIndex("by_cachedAt", "cachedAt");
          }

          if (!db.objectStoreNames.contains(META_STORE)) {
            // Inline value store; keys are passed explicitly on put/get.
            db.createObjectStore(META_STORE);
          }
        },
        blocked() {
          // Another tab holds an older version open. Nothing to do here; the
          // upgrade will proceed once that connection closes.
        },
        blocking() {
          // A newer version wants to open. Close ours so it can upgrade.
          void getDb().then((db) => db?.close());
          dbPromise = null;
        },
        terminated() {
          // The connection was killed (e.g. browser cleared storage). Force a
          // re-open on the next call.
          dbPromise = null;
        },
      });
    })().catch(() => null);
  }

  return dbPromise;
}

/**
 * Delete the entire offline database. Intended for tests / hard reset only —
 * not used by the app in normal operation.
 */
export async function deleteOfflineDb(): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const { deleteDB } = await import("idb");
  if (dbPromise) {
    const db = await dbPromise;
    db?.close();
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** UUID when available, otherwise a good-enough unique fallback. */
export function createId(prefix = "offline"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Classify a MIME type into the media kind stored on entries. */
export function mediaKindForType(type: string): OfflineMediaKind {
  return String(type || "").startsWith("video/") ? "video" : "image";
}
