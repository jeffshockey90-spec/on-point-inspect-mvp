"use client";


import { formatAppValue } from "../lib/app-time";
import { useEffect, useMemo, useState } from "react";
import {
  addOfflineQueueItem,
  filesToOfflinePhotos,
  getOfflineQueue,
  isOnline,
  processOfflineQueue,
} from "../lib/offlineSyncQueue";

type LocalDraft = {
  id: string;
  queueItemId: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  photoCount: number;
  createdAt: string;
};

const SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const SEVERITIES = [
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Maintenance",
  "Monitor",
  "Informational",
];

export default function OfflineFieldMode({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const draftStorageKey = useMemo(
    () => `offline-field-drafts-${inspectionId}`,
    [inspectionId]
  );

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);

  const [drafts, setDrafts] = useState<LocalDraft[]>([]);

  function refreshStatus() {
    setOnline(isOnline());
    setQueueCount(getOfflineQueue().length);
  }

  function loadDrafts() {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (!saved) {
        setDrafts([]);
        return;
      }

      const parsed = JSON.parse(saved);
      setDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDrafts([]);
    }
  }

  function saveDraftList(nextDrafts: LocalDraft[]) {
    setDrafts(nextDrafts);
    localStorage.setItem(draftStorageKey, JSON.stringify(nextDrafts));
  }

  useEffect(() => {
    refreshStatus();
    loadDrafts();

    const handleOnline = () => {
      refreshStatus();
      syncNow();
    };

    const handleOffline = () => refreshStatus();
    const handleQueueChange = () => refreshStatus();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("on-point-offline-queue-change", handleQueueChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(
        "on-point-offline-queue-change",
        handleQueueChange
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  async function saveOfflineFinding() {
    if (
      !title.trim() &&
      !observation.trim() &&
      !implication.trim() &&
      !recommendation.trim() &&
      photos.length === 0
    ) {
      alert("Add a title, note, or photo before saving.");
      return;
    }

    setSaving(true);

    try {
      const offlinePhotos =
        photos.length > 0 ? await filesToOfflinePhotos(photos) : [];

      const queueItem = addOfflineQueueItem({
        type: "finding",
        payload: {
          inspection_id: inspectionId,
          title: title.trim() || "Offline Field Finding",
          section,
          severity,
          observation: observation.trim(),
          implication: implication.trim(),
          recommendation: recommendation.trim(),
          photos: offlinePhotos,
        },
      });

      const localDraft: LocalDraft = {
        id: crypto.randomUUID(),
        queueItemId: queueItem.id,
        title: title.trim() || "Offline Field Finding",
        section,
        severity,
        observation: observation.trim(),
        implication: implication.trim(),
        recommendation: recommendation.trim(),
        photoCount: offlinePhotos.length,
        createdAt: new Date().toISOString(),
      };

      saveDraftList([localDraft, ...drafts]);

      setTitle("");
      setSection("Exterior");
      setSeverity("Recommended Repair");
      setObservation("");
      setImplication("");
      setRecommendation("");
      setPhotos([]);

      refreshStatus();

      if (isOnline()) {
        await syncNow();
      }
    } catch (error: any) {
      alert(error?.message || "Failed to save offline finding.");
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    if (!isOnline()) {
      setOnline(false);
      return;
    }

    setSyncing(true);

    try {
      await processOfflineQueue({
        onItemSynced: (item) => {
          if (item.type === "finding") {
            const saved = localStorage.getItem(draftStorageKey);
            if (!saved) return;

            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) return;

            const nextDrafts = parsed.filter(
              (draft: LocalDraft) => draft.queueItemId !== item.id
            );

            saveDraftList(nextDrafts);
          }
        },
      });

      refreshStatus();
    } catch (error: any) {
      alert(error?.message || "Offline sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  function removeLocalDraft(id: string) {
    const draft = drafts.find((item) => item.id === id);

    if (!draft) return;

    const nextDrafts = drafts.filter((item) => item.id !== id);
    saveDraftList(nextDrafts);

    const queue = getOfflineQueue();
    const nextQueue = queue.filter((item) => item.id !== draft.queueItemId);

    localStorage.setItem("on_point_offline_sync_queue", JSON.stringify(nextQueue));
    window.dispatchEvent(new CustomEvent("on-point-offline-queue-change"));
    refreshStatus();
  }

  function clearLocalDrafts() {
    if (!confirm("Clear local offline finding list?")) return;
    saveDraftList([]);
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Offline Field Mode
          </h2>

          <p className="mt-2 text-slate-300">
            Save findings and photos during weak signal. They sync through the
            On Point offline queue when connection returns.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div
            className={`rounded-full border px-4 py-2 text-sm font-bold ${
              online
                ? "border-green-500/40 bg-green-500/20 text-green-300"
                : "border-red-500/40 bg-red-500/20 text-red-300"
            }`}
          >
            {online ? "ONLINE" : "OFFLINE"}
          </div>

          <div className="rounded-full border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-bold text-slate-300">
            {queueCount} QUEUED
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Finding title"
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        />

        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        >
          {SECTIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        >
          {SEVERITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <TextArea
        label="Observation"
        value={observation}
        onChange={setObservation}
        placeholder="What was observed?"
      />

      <TextArea
        label="Implication"
        value={implication}
        onChange={setImplication}
        placeholder="Why does it matter?"
      />

      <TextArea
        label="Recommendation"
        value={recommendation}
        onChange={setRecommendation}
        placeholder="What should the client do?"
      />

      <label className="mt-5 block">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          Offline Photos
        </p>

        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(event) =>
            setPhotos(Array.from(event.target.files || []))
          }
          className="block w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-500 file:px-4 file:py-2 file:font-bold file:text-black"
        />

        {photos.length > 0 && (
          <p className="mt-2 text-sm text-slate-400">
            {photos.length} photo{photos.length === 1 ? "" : "s"} selected.
          </p>
        )}
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveOfflineFinding}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Offline Finding"}
        </button>

        <button
          type="button"
          onClick={syncNow}
          disabled={!online || syncing || queueCount === 0}
          className="rounded-xl border border-green-500 px-5 py-3 font-bold text-green-300 transition hover:bg-green-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {drafts.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-white">
              Local Offline Findings
            </h3>

            <button
              type="button"
              onClick={clearLocalDrafts}
              className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
            >
              Clear Local List
            </button>
          </div>

          <div className="space-y-4">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="rounded-xl border border-slate-700 bg-slate-950 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-teal-300">
                      {draft.title}
                    </h4>

                    <p className="text-sm text-slate-400">
                      {draft.section} • {draft.severity} •{" "}
                      {formatAppValue(new Date(draft.createdAt), {})}
                    </p>

                    <p className="mt-2 inline-flex rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-300">
                      Waiting in offline queue
                      {draft.photoCount > 0
                        ? ` • ${draft.photoCount} photo${
                            draft.photoCount === 1 ? "" : "s"
                          }`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLocalDraft(draft.id)}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </div>

                <FindingPreview label="Observation" value={draft.observation} />
                <FindingPreview label="Implication" value={draft.implication} />
                <FindingPreview
                  label="Recommendation"
                  value={draft.recommendation}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="mt-5 block">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
      />
    </label>
  );
}

function FindingPreview({ label, value }: { label: string; value: string }) {
  if (!value) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line leading-7 text-slate-300">
        {value}
      </p>
    </div>
  );
}