"use client";


import { formatAppValue } from "../lib/app-time";
import { useEffect, useState } from "react";
import {
  clearOfflineQueue,
  getOfflineQueue,
  getOfflineQueueSummary,
  isOnline,
  processOfflineQueue,
  setOfflineQueueItemStatus,
  startOfflineQueueAutoSync,
} from "../lib/offline/queue";
import {
  getCachedInspectionPreload,
  saveSyncCompletionNotice,
} from "../lib/offlineInspectionPreload";

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
  const [conflictCount, setConflictCount] = useState(0);
  const [syncingCount, setSyncingCount] = useState(0);
  const [skippedMediaCount, setSkippedMediaCount] = useState(0);
  const [skippedVideoCount, setSkippedVideoCount] = useState(0);
  const [lastFailedError, setLastFailedError] = useState("");
  const [megabytes, setMegabytes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [lastError, setLastError] = useState("");
  const [completionNotice, setCompletionNotice] = useState("");

  async function refreshStatus() {
    const summary = await getOfflineQueueSummary();

    setOnline(isOnline());
    setPendingCount(summary.count);
    setFindingCount(summary.findingCount);
    setReferencePhotoCount(summary.referencePhotoCount);
    setFailedCount(summary.failedCount || 0);
    setConflictCount(summary.conflictCount || 0);
    setSyncingCount(summary.syncingCount || 0);
    setSkippedMediaCount(summary.skippedMediaCount || 0);
    setSkippedVideoCount(summary.skippedVideoCount || 0);
    setLastFailedError(summary.lastFailedError || "");
    setMegabytes(summary.megabytes);
  }

  async function syncNow() {
    if (!isOnline()) {
      alert("You are offline. Sync will run when connection returns.");
      return;
    }

    setSyncing(true);
    setLastError("");

    // A manual retry should run immediately instead of waiting for the next
    // exponential-backoff window. Conflicts remain paused for inspector review.
    const queuedItems = await getOfflineQueue();
    await Promise.all(
      queuedItems
        .filter((item) => item.status === "failed")
        .map((item) =>
          setOfflineQueueItemStatus(item.id, "queued", {
            nextAttemptAt: undefined,
          }),
        ),
    );

    try {
      const result = await processOfflineQueue({
        onItemSynced: () => {
          setLastSynced(formatAppValue(new Date(), { hour: "2-digit", minute: "2-digit", hour12: false }));
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

      if (result.synced > 0) {
        const syncedFindings = (result.syncedItems || []).filter(
          (entry: any) => entry?.item?.type === "finding",
        );
        const aiProcessed = syncedFindings.filter(
          (entry: any) => entry?.result?.ai_after_sync?.ran,
        ).length;
        const firstInspectionId =
          syncedFindings[0]?.item?.payload?.inspection_id ||
          (result.syncedItems || [])[0]?.item?.payload?.inspection_id ||
          "";
        const cached = firstInspectionId
          ? getCachedInspectionPreload(String(firstInspectionId))
          : null;
        const label = cached?.inspection?.label || "Inspection";
        const notice = `${label} synced — ${result.synced} item${
          result.synced === 1 ? "" : "s"
        } uploaded${aiProcessed > 0 ? `, ${aiProcessed} processed by AI` : ""}.`;

        saveSyncCompletionNotice({
          inspectionId: String(firstInspectionId || ""),
          label,
          synced: result.synced,
          failed: result.failed,
          aiProcessed,
        });
        setCompletionNotice(notice);
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
          setLastSynced(formatAppValue(new Date(), { hour: "2-digit", minute: "2-digit", hour12: false }));
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

    const handleCompletionNotice = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      if (!detail?.synced) return;

      setCompletionNotice(
        `${detail.label || "Inspection"} synced — ${detail.synced} item${
          detail.synced === 1 ? "" : "s"
        } uploaded${detail.aiProcessed > 0 ? `, ${detail.aiProcessed} processed by AI` : ""}.`,
      );
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("on-point-offline-queue-change", handleQueueChange);
    window.addEventListener("opi:sync-completion-notice", handleCompletionNotice);

    const interval = window.setInterval(refreshStatus, 5000);

    return () => {
      stopAutoSync();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        "on-point-offline-queue-change",
        handleQueueChange,
      );
      window.removeEventListener(
        "opi:sync-completion-notice",
        handleCompletionNotice,
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

          {lastFailedError && (
            <p className="mt-1 break-words text-xs text-red-300/90">
              Reason: {lastFailedError}
            </p>
          )}

          {syncingCount > 0 && (
            <p className="mt-1 text-xs font-bold text-cyan-300">
              {syncingCount} item{syncingCount === 1 ? " is" : "s are"} uploading now.
            </p>
          )}

          {conflictCount > 0 && (
            <p className="mt-1 text-xs font-bold text-orange-300">
              {conflictCount} item{conflictCount === 1 ? " has" : "s have"} a sync conflict and will not overwrite newer server data automatically.
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

          {completionNotice && (
            <p className="mt-1 text-xs font-black text-emerald-300">
              {completionNotice}
            </p>
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

          {conflictCount > 0 && (
            <button
              type="button"
              onClick={async () => {
                const confirmRetry = window.confirm(
                  "Retry conflicted items? Newer server data will still be protected by the sync API when a true edit conflict exists.",
                );
                if (!confirmRetry) return;

                const queuedItems = await getOfflineQueue();
                await Promise.all(
                  queuedItems
                    .filter((item) => item.status === "conflict")
                    .map((item) =>
                      setOfflineQueueItemStatus(item.id, "queued", {
                        conflict: undefined,
                        lastError: undefined,
                        nextAttemptAt: undefined,
                      }),
                    ),
                );
                await refreshStatus();
                void syncNow();
              }}
              className="rounded-xl border border-orange-500 px-4 py-2 font-bold text-orange-200 transition active:scale-[0.98] hover:bg-orange-500/10 [touch-action:manipulation]"
            >
              Review / Retry Conflicts
            </button>
          )}

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={async () => {
                const confirmClear = window.confirm(
                  "Clear pending offline queue? Only do this if you are sure nothing needs synced.",
                );

                if (!confirmClear) return;

                await clearOfflineQueue();
                await refreshStatus();
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
