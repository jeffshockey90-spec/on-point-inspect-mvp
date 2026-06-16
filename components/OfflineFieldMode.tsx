"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type OfflineDraft = {
  id: string;
  inspectionId: string;
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  createdAt: string;
  syncedAt?: string | null;
  syncError?: string | null;
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
  const storageKey = useMemo(
    () => `offline-field-drafts-${inspectionId}`,
    [inspectionId]
  );

  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [title, setTitle] = useState("");
  const [section, setSection] = useState("Exterior");
  const [severity, setSeverity] = useState("Recommended Repair");
  const [observation, setObservation] = useState("");
  const [implication, setImplication] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);

  const unsyncedDrafts = drafts.filter((draft) => !draft.syncedAt);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDrafts(Array.isArray(parsed) ? parsed : []);
      } catch {
        setDrafts([]);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(drafts));
  }, [drafts, storageKey]);

  useEffect(() => {
    if (isOnline && unsyncedDrafts.length > 0 && !syncing) {
      syncDrafts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, drafts.length]);

  function saveDraft() {
    if (
      !title.trim() &&
      !observation.trim() &&
      !implication.trim() &&
      !recommendation.trim()
    ) {
      alert("Add a title or finding details before saving.");
      return;
    }

    const newDraft: OfflineDraft = {
      id: crypto.randomUUID(),
      inspectionId,
      title: title.trim() || "Untitled Finding",
      section,
      severity,
      observation: observation.trim(),
      implication: implication.trim(),
      recommendation: recommendation.trim(),
      createdAt: new Date().toISOString(),
      syncedAt: null,
      syncError: null,
    };

    setDrafts((current) => [newDraft, ...current]);

    setTitle("");
    setSection("Exterior");
    setSeverity("Recommended Repair");
    setObservation("");
    setImplication("");
    setRecommendation("");
  }

  function deleteDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function clearSynced() {
    setDrafts((current) => current.filter((draft) => !draft.syncedAt));
  }

  function clearAll() {
    if (!confirm("Clear all offline findings for this report?")) return;
    setDrafts([]);
    localStorage.removeItem(storageKey);
  }

  async function syncDrafts() {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }

    const pending = drafts.filter((draft) => !draft.syncedAt);
    if (pending.length === 0) return;

    setSyncing(true);

    const updatedDrafts = [...drafts];

    for (const draft of pending) {
      const index = updatedDrafts.findIndex((item) => item.id === draft.id);
      if (index === -1) continue;

      try {
        const { error } = await supabase.from("findings").insert({
          inspection_id: draft.inspectionId,
          title: draft.title,
          section: draft.section,
          severity: draft.severity,
          observation: draft.observation,
          implication: draft.implication,
          recommendation: draft.recommendation,
        });

        if (error) throw error;

        updatedDrafts[index] = {
          ...updatedDrafts[index],
          syncedAt: new Date().toISOString(),
          syncError: null,
        };
      } catch (error: any) {
        updatedDrafts[index] = {
          ...updatedDrafts[index],
          syncError: error?.message || "Sync failed.",
        };
      }

      setDrafts([...updatedDrafts]);
    }

    setSyncing(false);
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Offline Field Mode
          </h2>

          <p className="mt-2 text-slate-300">
            Save findings locally during weak signal. Unsynced findings upload
            automatically when connection returns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`rounded-full border px-4 py-2 text-sm font-bold ${
              isOnline
                ? "border-green-500/40 bg-green-500/20 text-green-300"
                : "border-red-500/40 bg-red-500/20 text-red-300"
            }`}
          >
            {isOnline ? "ONLINE" : "OFFLINE"}
          </div>

          <div className="rounded-full border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-bold text-slate-300">
            {unsyncedDrafts.length} UNSYNCED
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

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDraft}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
        >
          Save Offline Finding
        </button>

        <button
          type="button"
          onClick={syncDrafts}
          disabled={!isOnline || syncing || unsyncedDrafts.length === 0}
          className="rounded-xl border border-green-500 px-5 py-3 font-bold text-green-300 transition hover:bg-green-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>

        {drafts.some((draft) => draft.syncedAt) && (
          <button
            type="button"
            onClick={clearSynced}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-300 transition hover:bg-slate-800"
          >
            Clear Synced
          </button>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-white">
              Offline Findings
            </h3>

            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
            >
              Clear All
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
                      {new Date(draft.createdAt).toLocaleString()}
                    </p>

                    <p
                      className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-bold ${
                        draft.syncedAt
                          ? "border-green-500/40 bg-green-500/10 text-green-300"
                          : draft.syncError
                          ? "border-red-500/40 bg-red-500/10 text-red-300"
                          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                      }`}
                    >
                      {draft.syncedAt
                        ? `Synced ${new Date(draft.syncedAt).toLocaleString()}`
                        : draft.syncError
                        ? `Sync Error: ${draft.syncError}`
                        : "Waiting to sync"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteDraft(draft.id)}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"
                  >
                    Delete
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