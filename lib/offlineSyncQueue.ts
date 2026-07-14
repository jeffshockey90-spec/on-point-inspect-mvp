export type OfflineQueueItemType = "finding" | "reference_photo";

export type OfflinePhoto = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  base64: string;
};

export type OfflineQueueItem = {
  id: string;
  type: OfflineQueueItemType;
  payload: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
  retryCount: number;
  status?: "queued" | "syncing" | "failed" | "conflict";
  nextAttemptAt?: string;
  lastError?: string;
  conflict?: Record<string, any>;
};

export type OfflineSyncResult = {
  ok: boolean;
  synced: number;
  failed: number;
  remaining: number;
  offline: boolean;
  syncedItems: Array<{
    item: OfflineQueueItem;
    result?: any;
  }>;
  failedItems: Array<{
    item: OfflineQueueItem;
    error: string;
  }>;
};

import { dispatchInspectionDataChanged, OFFLINE_SYNC_COMPLETE_EVENT } from "./inspectionEvents";

const OFFLINE_QUEUE_KEY = "on_point_offline_sync_queue";
const QUEUE_CHANGE_EVENT = "on-point-offline-queue-change";
const AUTO_SYNC_LOCK_KEY = "on_point_offline_sync_running";

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let processingQueue = false;

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function notifyQueueChange() {
  const win = safeWindow();
  if (!win) return;

  win.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOnline() {
  const win = safeWindow();
  if (!win || typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  const win = safeWindow();
  if (!win) return [];

  try {
    const saved = win.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setOfflineQueue(queue: OfflineQueueItem[]) {
  const win = safeWindow();
  if (!win) return;

  win.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  notifyQueueChange();
}

export function clearOfflineQueue() {
  const win = safeWindow();
  if (!win) return;

  win.localStorage.removeItem(OFFLINE_QUEUE_KEY);
  notifyQueueChange();
}

export function addOfflineQueueItem({
  type,
  payload,
}: {
  type: OfflineQueueItemType;
  payload: Record<string, any>;
}) {
  const queueItem: OfflineQueueItem = {
    id: createId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    status: "queued",
  };

  const queue = getOfflineQueue();
  setOfflineQueue([queueItem, ...queue]);

  return queueItem;
}

export function removeOfflineQueueItem(id: string) {
  const queue = getOfflineQueue();
  setOfflineQueue(queue.filter((item) => item.id !== id));
}

export function updateOfflineQueueItem(
  id: string,
  updater: (item: OfflineQueueItem) => OfflineQueueItem,
) {
  const queue = getOfflineQueue();
  setOfflineQueue(
    queue.map((item) => (item.id === id ? updater(item) : item)),
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    };

    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image for offline storage."));
    };

    image.src = objectUrl;
  });
}

async function compressImageForOfflineQueue(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const image = await loadImageFromFile(file);
    const maxDimension = 900;
    const longestSide = Math.max(image.width, image.height);
    const scale = Math.min(1, maxDimension / longestSide);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.55);
    });

    if (!blob) return file;

    return new File(
      [blob],
      `${file.name.replace(/\.[^/.]+$/, "") || "offline-photo"}-offline.jpg`,
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      },
    );
  } catch {
    return file;
  }
}

export async function filesToOfflinePhotos(files: File[]): Promise<OfflinePhoto[]> {
  const limitedFiles = files.slice(0, 6);

  const photos = await Promise.all(
    limitedFiles.map(async (file) => {
      const safeFile = await compressImageForOfflineQueue(file);

      return {
        name: safeFile.name || `offline-photo-${Date.now()}.jpg`,
        type: safeFile.type || "image/jpeg",
        size: safeFile.size || 0,
        lastModified: safeFile.lastModified || Date.now(),
        base64: await readFileAsDataUrl(safeFile),
      };
    }),
  );

  return photos;
}

export function getOfflineQueueSummary() {
  const queue = getOfflineQueue();

  const totalBytes = queue.reduce((sum, item) => {
    const photos = Array.isArray(item.payload?.photos)
      ? item.payload.photos
      : [];

    return (
      sum +
      photos.reduce((photoSum: number, photo: OfflinePhoto) => {
        return photoSum + Number(photo.size || 0);
      }, 0)
    );
  }, 0);

  const findingCount = queue.filter((item) => item.type === "finding").length;
  const referencePhotoCount = queue.filter(
    (item) => item.type === "reference_photo",
  ).length;

  const skippedMediaCount = queue.reduce((sum, item) => {
    return sum + Number(item.payload?.offline_media_skipped_count || 0);
  }, 0);

  const skippedVideoCount = queue.reduce((sum, item) => {
    return sum + Number(item.payload?.offline_video_skipped_count || 0);
  }, 0);

  const failedCount = queue.filter((item) => item.lastError).length;
  const conflictCount = queue.filter((item) => item.status === "conflict").length;
  const syncingCount = queue.filter((item) => item.status === "syncing").length;

  return {
    count: queue.length,
    findingCount,
    referencePhotoCount,
    failedCount,
    conflictCount,
    syncingCount,
    skippedMediaCount,
    skippedVideoCount,
    bytes: totalBytes,
    megabytes: Number((totalBytes / 1024 / 1024).toFixed(2)),
  };
}

function setAutoSyncLock(active: boolean) {
  const win = safeWindow();
  if (!win) return;

  try {
    if (active) {
      win.sessionStorage.setItem(AUTO_SYNC_LOCK_KEY, "1");
    } else {
      win.sessionStorage.removeItem(AUTO_SYNC_LOCK_KEY);
    }
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

export async function processOfflineQueue({
  onItemSynced,
  onItemFailed,
}: {
  onItemSynced?: (item: OfflineQueueItem, result?: any) => void;
  onItemFailed?: (item: OfflineQueueItem, error: any) => void;
} = {}): Promise<OfflineSyncResult & { busy?: boolean }> {
  const syncedItems: OfflineSyncResult["syncedItems"] = [];
  const failedItems: OfflineSyncResult["failedItems"] = [];

  if (!isOnline()) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      remaining: getOfflineQueue().length,
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
      remaining: getOfflineQueue().length,
      offline: false,
      busy: true,
      syncedItems,
      failedItems,
    };
  }

  processingQueue = true;
  setAutoSyncLock(true);

  const now = Date.now();
  const queue = getOfflineQueue()
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
        updateOfflineQueueItem(item.id, (current) => ({
          ...current,
          status: "syncing",
          updatedAt: new Date().toISOString(),
          lastError: undefined,
        }));

        const res = await fetch("/api/offline-ai-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(item),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          const conflictMessage = data.error || "A newer server version was detected.";
          updateOfflineQueueItem(item.id, (current) => ({
            ...current,
            status: "conflict",
            updatedAt: new Date().toISOString(),
            lastError: conflictMessage,
            conflict: data.conflict || data,
          }));
          failed += 1;
          failedItems.push({ item, error: conflictMessage });
          onItemFailed?.(item, new Error(conflictMessage));
          continue;
        }

        if (!res.ok) {
          throw new Error(data.error || "Offline item sync failed.");
        }

        removeOfflineQueueItem(item.id);
        synced += 1;
        syncedItems.push({ item, result: data });
        onItemSynced?.(item, data);
      } catch (error: any) {
        const message = error?.message || "Sync failed.";
        failed += 1;

        updateOfflineQueueItem(item.id, (current) => {
          const retryCount = Number(current.retryCount || 0) + 1;
          const backoffMs = Math.min(15 * 60 * 1000, 5000 * 2 ** Math.min(8, retryCount - 1));

          return {
            ...current,
            retryCount,
            status: "failed",
            updatedAt: new Date().toISOString(),
            nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
            lastError: message,
          };
        });

        failedItems.push({ item, error: message });
        onItemFailed?.(item, error);
      }
    }
  } finally {
    processingQueue = false;
    setAutoSyncLock(false);
  }

  const remaining = getOfflineQueue().length;

  if (synced > 0) {
    const grouped = new Map<string, { inspectionId: string; section?: string; types: Set<string> }>();

    for (const syncedItem of syncedItems) {
      const inspectionId = String(
        syncedItem.item.payload?.inspectionId ||
          syncedItem.item.payload?.inspection_id ||
          "",
      );
      const section = String(syncedItem.item.payload?.section || "") || undefined;
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
    if (!isOnline() || getOfflineQueue().length === 0) return;

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
