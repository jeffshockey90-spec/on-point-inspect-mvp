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

  window.localStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(items)
  );

  window.dispatchEvent(
    new CustomEvent("on-point-offline-queue-change")
  );
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

export async function filesToOfflinePhotos(
  files: File[]
): Promise<OfflinePhotoPayload[]> {
  const photos: OfflinePhotoPayload[] = [];

  for (const file of files) {
    const base64 = await fileToBase64(file);

    photos.push({
      name: file.name,
      type: file.type || "image/jpeg",
      size: file.size,
      base64,
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
