"use client";

import { useEffect, useState } from "react";
import {
  clearOfflineQueue,
  getOfflineQueue,
  getOfflineQueueSummary,
  isOnline,
  processOfflineQueue,
  startOfflineQueueAutoSync,
} from "../lib/offlineSyncQueue";

const OFFLINE_SYNC_COMPLETE_EVENT = "opi:offline-sync-complete";
const OFFLINE_SYNC_COMPLETE_KEY = "opi-offline-sync-complete-at";

function notifyOfflineSyncComplete() {
  if (typeof window === "undefined") return;

  const syncedAt = new Date().toISOString();
  window.localStorage.setItem(OFFLINE_SYNC_COMPLETE_KEY, syncedAt);
  window.dispatchEvent(
    new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, {
      detail: { syncedAt },
    }),
  );
}

export default function OfflineSyncStatus() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [findingCount, setFindingCount] = useState(0);
  const [referencePhotoCount, setReferencePhotoCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedMediaCount, setSkippedMediaCount] = useState(0);
  const [skippedVideoCount, setSkippedVideoCount] = useState(0);
  const [megabytes, setMegabytes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [lastError, setLastError] = useState("");

  function refreshStatus() {
    const summary = getOfflineQueueSummary();

    setOnline(isOnline());
    setPendingCount(getOfflineQueue().length);
    setFindingCount(summary.findingCount);
    setReferencePhotoCount(summary.referencePhotoCount);
    setFailedCount(summary.failedCount || 0);
    setSkippedMediaCount(summary.skippedMediaCount || 0);
    setSkippedVideoCount(summary.skippedVideoCount || 0);
    setMegabytes(summary.megabytes);
  }

  async function syncNow() {
    if (!isOnline()) {
      alert("You are offline. Sync will run when connection returns.");
      return;
    }

    setSyncing(true);
    setLastError("");

    try {
      const result = await processOfflineQueue({
        onItemSynced: () => {
          setLastSynced(new Date().toLocaleTimeString());
          refreshStatus();
        },
        onItemFailed: (_item, error) => {
          setLastError(error?.message || "One item failed to sync.");
        },
      });

      if (result.failed > 0) {
        setLastError(
          `${result.failed} item${result.failed === 1 ? "" : "s"} failed to sync.`,
        );
      }

      refreshStatus();

      if (result.synced > 0) {
        notifyOfflineSyncComplete();
      }
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    refreshStatus();

    const stopAutoSync = startOfflineQueueAutoSync({
      intervalMs: 30000,
      onSynced: (result) => {
        if (result.synced > 0) {
          setLastSynced(new Date().toLocaleTimeString());
          notifyOfflineSyncComplete();
        }

        if (result.failed > 0) {
          setLastError(
            `${result.failed} item${result.failed === 1 ? "" : "s"} failed to sync.`,
          );
        }

        refreshStatus();
      },
      onFailed: (error) => {
        setLastError(error?.message || "Background sync failed.");
        refreshStatus();
      },
    });

    const handleOnline = () => {
      refreshStatus();
      void syncNow();
    };

    const handleOffline = () => {
      refreshStatus();
    };

    const handleQueueChange = () => {
      refreshStatus();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("on-point-offline-queue-change", handleQueueChange);

    const interval = window.setInterval(refreshStatus, 5000);

    return () => {
      stopAutoSync();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        "on-point-offline-queue-change",
        handleQueueChange,
      );
      window.clearInterval(interval);
    };
    // syncNow intentionally omitted so the auto-sync listener stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-400">
            Sync Status
          </p>

          <h3 className="mt-1 text-xl font-extrabold">
            {online ? "Online" : "Offline Mode"}
          </h3>

          <p className="mt-1 text-sm text-slate-300">
            {pendingCount > 0
              ? `${pendingCount} item${
                  pendingCount === 1 ? "" : "s"
                } waiting to sync. Background sync will keep retrying.`
              : "Everything is synced."}
          </p>

          {pendingCount > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {findingCount} finding{findingCount === 1 ? "" : "s"} •{" "}
              {referencePhotoCount} reference photo
              {referencePhotoCount === 1 ? "" : "s"} • about {megabytes} MB
            </p>
          )}

          {skippedMediaCount > 0 && (
            <p className="mt-1 text-xs font-bold text-yellow-200">
              {skippedMediaCount} large media file
              {skippedMediaCount === 1 ? "" : "s"} skipped from browser
              offline storage
              {skippedVideoCount > 0
                ? `, including ${skippedVideoCount} video${
                    skippedVideoCount === 1 ? "" : "s"
                  }`
                : ""}
              . Originals stay on the device.
            </p>
          )}

          {failedCount > 0 && (
            <p className="mt-1 text-xs font-bold text-red-300">
              {failedCount} item{failedCount === 1 ? "" : "s"} need another
              retry.
            </p>
          )}

          {lastSynced && (
            <p className="mt-1 text-xs text-slate-400">
              Last synced: {lastSynced}
            </p>
          )}

          {lastError && (
            <p className="mt-1 text-xs font-bold text-red-300">{lastError}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing || !online || pendingCount === 0}
            className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const confirmClear = window.confirm(
                  "Clear pending offline queue? Only do this if you are sure nothing needs synced.",
                );

                if (!confirmClear) return;

                clearOfflineQueue();
                refreshStatus();
              }}
              className="rounded-xl border border-red-500 px-4 py-2 font-bold text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 [touch-action:manipulation]"
            >
              Clear Queue
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`${online ? "bg-teal-400" : "bg-yellow-400"} h-full`}
          style={{
            width: online ? "100%" : "45%",
          }}
        />
      </div>
    </div>
  );
}
