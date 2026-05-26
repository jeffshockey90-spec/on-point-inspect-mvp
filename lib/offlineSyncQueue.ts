"use client";

export type OfflinePhotoPayload = {
  name: string;
  type: string;
  size: number;
  base64: string;
};

export type OfflineQueueItem = {
  id: string;
  type: "finding" | "photo" | "inspection" | "template";
  createdAt: string;
  attempts: number;
  payload: any;
};

const QUEUE_KEY = "on_point_offline_sync_queue";

export function isBrowser() {
  return typeof window !== "undefined";
}

export function isOnline() {
  if (!isBrowser()) return true;
  return navigator.onLine;
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

export function saveOfflineQueue(items: OfflineQueueItem[]) {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items)
    );

    window.dispatchEvent(
      new CustomEvent("on-point-offline-queue-change")
    );
  } catch (error: any) {
    if (
      error?.name === "QuotaExceededError" ||
      error?.message?.toLowerCase?.().includes("quota")
    ) {
      throw new Error(
        "Offline storage is full. Try using fewer photos or smaller photos, then sync/clear the queue."
      );
    }

    throw error;
  }
}

export function addOfflineQueueItem(
  item: Omit<OfflineQueueItem, "id" | "createdAt" | "attempts">
) {
  const queue = getOfflineQueue();

  const newItem: OfflineQueueItem = {
    id: `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...item,
  };

  saveOfflineQueue([...queue, newItem]);

  return newItem;
}

export function removeOfflineQueueItem(id: string) {
  const queue = getOfflineQueue();

  saveOfflineQueue(
    queue.filter((item) => item.id !== id)
  );
}

export function clearOfflineQueue() {
  saveOfflineQueue([]);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(reader.result as string);

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

async function compressImageToBase64(
  file: File,
  maxWidth = 1600,
  quality = 0.7
): Promise<{
  base64: string;
  type: string;
  size: number;
}> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("Image compression requires a browser."));
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file is not an image."));
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const scale =
          img.width > maxWidth
            ? maxWidth / img.width
            : 1;

        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

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

        const approximateSize = Math.round(
          (base64.length * 3) / 4
        );

        resolve({
          base64,
          type: outputType,
          size: approximateSize,
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

export async function filesToOfflinePhotos(
  files: File[]
): Promise<OfflinePhotoPayload[]> {
  const photos: OfflinePhotoPayload[] = [];

  for (const file of files) {
    const compressed = await compressImageToBase64(
      file,
      1600,
      0.7
    );

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
  if (!isOnline()) return;

  const queue = getOfflineQueue();

  for (const item of queue) {
    try {
      const res = await fetch("/api/offline-ai-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(item),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Offline sync failed."
        );
      }

      removeOfflineQueueItem(item.id);
      onItemSynced?.(item);
    } catch (error) {
      const currentQueue = getOfflineQueue();

      saveOfflineQueue(
        currentQueue.map((queuedItem) =>
          queuedItem.id === item.id
            ? {
                ...queuedItem,
                attempts:
                  (queuedItem.attempts || 0) + 1,
              }
            : queuedItem
        )
      );

      onItemFailed?.(item, error);
    }
  }
}
