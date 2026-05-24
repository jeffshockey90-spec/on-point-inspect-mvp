"use client";

import { useEffect, useState } from "react";

type OfflineDraft = {
  id: string;
  title: string;
  section: string;
  note: string;
  createdAt: string;
};

export default function OfflineFieldMode({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const storageKey = `offline-field-drafts-${inspectionId}`;

  const [isOnline, setIsOnline] = useState(true);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("General");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        setDrafts(JSON.parse(saved));
      } catch {
        setDrafts([]);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [storageKey]);

  function saveDraft() {
    if (!title.trim() && !note.trim()) return;

    const newDraft: OfflineDraft = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled Finding",
      section,
      note,
      createdAt: new Date().toISOString(),
    };

    const updated = [newDraft, ...drafts];

    setDrafts(updated);

    localStorage.setItem(storageKey, JSON.stringify(updated));

    setTitle("");
    setSection("General");
    setNote("");
  }

  function deleteDraft(id: string) {
    const updated = drafts.filter((draft) => draft.id !== id);

    setDrafts(updated);

    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  function clearAll() {
    setDrafts([]);

    localStorage.removeItem(storageKey);
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Offline Field Mode
          </h2>

          <p className="mt-2 text-slate-300">
            Save field notes locally if signal drops during the inspection.
          </p>
        </div>

        <div
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            isOnline
              ? "border-green-500/40 bg-green-500/20 text-green-300"
              : "border-red-500/40 bg-red-500/20 text-red-300"
          }`}
        >
          {isOnline ? "ONLINE" : "OFFLINE"}
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
          <option>General</option>
          <option>Safety</option>
          <option>Exterior</option>
          <option>Roof</option>
          <option>Basement, Foundation, Crawlspace & Structure</option>
          <option>Heating</option>
          <option>Cooling</option>
          <option>Plumbing</option>
          <option>Electrical</option>
          <option>Fireplace</option>
          <option>Attic, Insulation & Ventilation</option>
          <option>Doors, Windows & Interior</option>
          <option>Built-in Appliances</option>
          <option>Garage</option>
        </select>

        <button
          onClick={saveDraft}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
        >
          Save Offline Note
        </button>
      </div>

      <textarea
        rows={5}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write field notes here..."
        className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-teal-400"
      />

      {drafts.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">
              Saved Offline Notes
            </h3>

            <button
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
                      {draft.section} •{" "}
                      {new Date(draft.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <button
                    onClick={() => deleteDraft(draft.id)}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"
                  >
                    Delete
                  </button>
                </div>

                <p className="whitespace-pre-line leading-7 text-slate-300">
                  {draft.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}