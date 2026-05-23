"use client";

import { useEffect, useState } from "react";

type QueuedFinding = {
  id: string;
  reportId: string;
  section: string;
  severity: string;
  note: string;
  imageDataUrl?: string;
  createdAt: string;
  status: "queued" | "syncing" | "synced" | "failed";
  error?: string;
};

const STORAGE_KEY = "on_point_offline_ai_queue";

export default function OfflineAIQueue({ reportId }: { reportId: string }) {
  const [items, setItems] = useState<QueuedFinding[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    loadItems();

    function handleOnline() {
      setOnline(true);
      syncQueue();
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function loadItems() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    setItems(parsed);
  }

  function saveItems(nextItems: QueuedFinding[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    setItems(nextItems);
  }

  async function syncQueue() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: QueuedFinding[] = raw ? JSON.parse(raw) : [];

    const pending = queue.filter(
      (item) =>
        item.reportId === reportId &&
        item.status !== "synced"
    );

    if (pending.length === 0) return;

    for (const item of pending) {
      const syncingQueue = queue.map((q) =>
        q.id === item.id ? { ...q, status: "syncing" as const } : q
      );

      saveItems(syncingQueue);

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
          throw new Error(data.error || "Sync failed");
        }

        const syncedQueue = syncingQueue.map((q) =>
          q.id === item.id ? { ...q, status: "synced" as const } : q
        );

        saveItems(syncedQueue);
      } catch (error: any) {
        const failedQueue = syncingQueue.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: "failed" as const,
                error: error.message || "Sync failed",
              }
            : q
        );

        saveItems(failedQueue);
      }
    }
  }

  function clearSynced() {
    const nextItems = items.filter((item) => item.status !== "synced");
    saveItems(nextItems);
  }

  const reportItems = items.filter((item) => item.reportId === reportId);

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Offline AI Queue
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            {online
              ? "Online — queued findings can sync."
              : "Offline — findings will save locally until service returns."}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={syncQueue}
            disabled={!online}
            className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-black disabled:opacity-50"
          >
            Sync Now
          </button>

          <button
            onClick={clearSynced}
            className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-white hover:bg-slate-800"
          >
            Clear Synced
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {reportItems.length === 0 ? (
          <p className="text-sm text-slate-500">
            No offline findings queued for this report.
          </p>
        ) : (
          reportItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-white">{item.section}</p>
                  <p className="text-sm text-slate-400">{item.note}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>

                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase text-teal-300">
                  {item.status}
                </span>
              </div>

              {item.error && (
                <p className="mt-2 text-sm text-red-300">{item.error}</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}