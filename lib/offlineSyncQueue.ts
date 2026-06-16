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
  retryCount: number;
  lastError?: string;
};

const OFFLINE_QUEUE_KEY = "on_point_offline_sync_queue";
const QUEUE_CHANGE_EVENT = "on-point-offline-queue-change";

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
    retryCount: 0,
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
  updater: (item: OfflineQueueItem) => OfflineQueueItem
) {
  const queue = getOfflineQueue();
  setOfflineQueue(
    queue.map((item) => (item.id === id ? updater(item) : item))
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

export async function filesToOfflinePhotos(files: File[]): Promise<OfflinePhoto[]> {
  const limitedFiles = files.slice(0, 6);

  const photos = await Promise.all(
    limitedFiles.map(async (file) => ({
      name: file.name || `offline-photo-${Date.now()}.jpg`,
      type: file.type || "image/jpeg",
      size: file.size || 0,
      lastModified: file.lastModified || Date.now(),
      base64: await readFileAsDataUrl(file),
    }))
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
    (item) => item.type === "reference_photo"
  ).length;

  return {
    count: queue.length,
    findingCount,
    referencePhotoCount,
    bytes: totalBytes,
    megabytes: Number((totalBytes / 1024 / 1024).toFixed(2)),
  };
}

export async function processOfflineQueue({
  onItemSynced,
  onItemFailed,
}: {
  onItemSynced?: (item: OfflineQueueItem, result?: any) => void;
  onItemFailed?: (item: OfflineQueueItem, error: any) => void;
} = {}) {
  if (!isOnline()) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      remaining: getOfflineQueue().length,
      offline: true,
    };
  }

  const queue = getOfflineQueue().slice().reverse();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await fetch("/api/offline-ai-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(item),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Offline item sync failed.");
      }

      removeOfflineQueueItem(item.id);
      synced += 1;
      onItemSynced?.(item, data);
    } catch (error: any) {
      failed += 1;

      updateOfflineQueueItem(item.id, (current) => ({
        ...current,
        retryCount: Number(current.retryCount || 0) + 1,
        lastError: error?.message || "Sync failed.",
      }));

      onItemFailed?.(item, error);
    }
  }

  return {
    ok: failed === 0,
    synced,
    failed,
    remaining: getOfflineQueue().length,
    offline: false,
  };
}
