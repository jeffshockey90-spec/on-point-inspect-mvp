"use client";

export type OfflinePhotoPayload = {
  name: string;
  type: string;
  size: number;
  base64: string;
};

export type OfflineQueueItemType =
  | "finding"
  | "reference_photo"
  | "photo"
  | "inspection"
  | "template";

export type OfflineQueueItem = {
  id: string;
  type: OfflineQueueItemType;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  payload: any;
};

const QUEUE_KEY = "on_point_offline_sync_queue";
const MAX_QUEUE_ITEMS = 50;
const MAX_PHOTOS_PER_ITEM = 6;
const MAX_QUEUE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1200;
const IMAGE_QUALITY = 0.62;

let syncInProgress = false;

export function isBrowser() {
  return typeof window !== "undefined";
}

export function isOnline() {
  if (!isBrowser()) return true;
  return navigator.onLine;
}

function getStorageBytes(value: string) {
  return new Blob([value]).size;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getOfflineQueueSummary() {
  const queue = getOfflineQueue();
  const raw = isBrowser() ? window.localStorage.getItem(QUEUE_KEY) || "" : "";
  const bytes = getStorageBytes(raw);

  return {
    count: queue.length,
    bytes,
    megabytes: Number((bytes / 1024 / 1024).toFixed(1)),
    maxMegabytes: Number((MAX_QUEUE_BYTES / 1024 / 1024).toFixed(0)),
  };
}

export function saveOfflineQueue(items: OfflineQueueItem[]) {
  if (!isBrowser()) return;

  if (items.length > MAX_QUEUE_ITEMS) {
    throw new Error(
      `Offline queue is full. Sync or clear some items before adding more. Limit: ${MAX_QUEUE_ITEMS} items.`
    );
  }

  try {
    const serialized = JSON.stringify(items);
    const bytes = getStorageBytes(serialized);

    if (bytes > MAX_QUEUE_BYTES) {
      throw new Error(
        "Offline storage is getting too large. Sync queued items before adding more photos."
      );
    }

    window.localStorage.setItem(QUEUE_KEY, serialized);
    window.dispatchEvent(new CustomEvent("on-point-offline-queue-change"));
  } catch (error: any) {
    if (
      error?.name === "QuotaExceededError" ||
      error?.message?.toLowerCase?.().includes("quota")
    ) {
      throw new Error(
        "Offline storage is full. Try using fewer photos, then sync or clear the queue."
      );
    }

    throw error;
  }
}

export function addOfflineQueueItem(
  item: Omit<OfflineQueueItem, "id" | "createdAt" | "attempts" | "lastError">
) {
  const queue = getOfflineQueue();

  const newItem: OfflineQueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    ...item,
  };

  saveOfflineQueue([...queue, newItem]);
  return newItem;
}

export function removeOfflineQueueItem(id: string) {
  const queue = getOfflineQueue();
  saveOfflineQueue(queue.filter((item) => item.id !== id));
}

export function clearOfflineQueue() {
  saveOfflineQueue([]);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageToBase64(
  file: File,
  maxWidth = MAX_IMAGE_WIDTH,
  quality = IMAGE_QUALITY
): Promise<{ base64: string; type: string; size: number }> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("Image compression requires a browser."));
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Offline mode currently supports photos only. Videos are too large for safe offline storage."));
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;
        const scale = Math.min(1, maxWidth / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not prepare image compression."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const outputType = "image/jpeg";
        const base64 = canvas.toDataURL(outputType, quality);
        URL.revokeObjectURL(objectUrl);

        resolve({
          base64,
          type: outputType,
          size: Math.round((base64.length * 3) / 4),
        });
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image for offline compression."));
    };

    img.src = objectUrl;
  });
}

export async function filesToOfflinePhotos(files: File[]): Promise<OfflinePhotoPayload[]> {
  const safeFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, MAX_PHOTOS_PER_ITEM);

  if (files.some((file) => !file.type.startsWith("image/"))) {
    throw new Error("Offline mode only supports photos. Videos must be uploaded when you are online.");
  }

  if (files.length > MAX_PHOTOS_PER_ITEM) {
    throw new Error(`Offline mode supports up to ${MAX_PHOTOS_PER_ITEM} photos per saved item to keep the app fast.`);
  }

  const photos: OfflinePhotoPayload[] = [];

  for (const file of safeFiles) {
    const compressed = await compressImageToBase64(file);
    const cleanName = file.name
      ? file.name.replace(/\.[^/.]+$/, "") + "-offline.jpg"
      : "offline-photo.jpg";

    photos.push({
      name: cleanName,
      type: compressed.type,
      size: compressed.size,
      base64: compressed.base64,
    });
  }

  return photos;
}

export async function processOfflineQueue({
  onItemSynced,
  onItemFailed,
}: {
  onItemSynced?: (item: OfflineQueueItem) => void;
  onItemFailed?: (item: OfflineQueueItem, error: any) => void;
} = {}) {
  if (!isOnline() || syncInProgress) return;

  syncInProgress = true;

  try {
    const queue = getOfflineQueue();

    for (const item of queue) {
      try {
        const res = await fetch("/api/offline-ai-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "Offline sync failed.");
        }

        removeOfflineQueueItem(item.id);
        onItemSynced?.(item);
      } catch (error: any) {
        const message = error?.message || "Offline sync failed.";
        const currentQueue = getOfflineQueue();

        saveOfflineQueue(
          currentQueue.map((queuedItem) =>
            queuedItem.id === item.id
              ? {
                  ...queuedItem,
                  attempts: (queuedItem.attempts || 0) + 1,
                  lastError: message,
                }
              : queuedItem
          )
        );

        onItemFailed?.(item, error);
      }
    }
  } finally {
    syncInProgress = false;
  }
}
