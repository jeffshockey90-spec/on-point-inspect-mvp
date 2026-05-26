"use client";

import { useEffect, useState } from "react";

export default function InsertFavoriteFindingButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    async function loadTemplates() {
      try {
        const res = await fetch("/api/get-finding-templates");
        const data = await res.json();

        if (Array.isArray(data)) {
          setTemplates(data);
        }
      } catch {
        console.error("Failed to load templates");
      }
    }

    loadTemplates();
  }, [open]);

  async function insertTemplate(templateId: string) {
    setLoading(true);

    try {
      const res = await fetch("/api/insert-finding-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          templateId,
        }),
      });

      if (!res.ok) {
        alert("Failed to insert template.");
        return;
      }

      window.location.reload();
    } catch {
      alert("Failed to insert template.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = templates.filter((template) => {
    const text = `
      ${template.title || ""}
      ${template.section || ""}
      ${template.observation || ""}
    `.toLowerCase();

    return text.includes(search.toLowerCase());
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-yellow-500 bg-yellow-500/10 px-5 py-3 font-bold text-yellow-300 hover:bg-yellow-500/20"
      >
        + Insert Favorite Finding
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-2xl">
            <div className="border-b border-slate-700 p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-black text-yellow-300">
                  Insert Favorite Finding
                </h2>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
                >
                  Close
                </button>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search findings..."
                className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-yellow-400"
              />
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5">
              <div className="space-y-4">
                {filtered.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-2xl border border-slate-700 bg-[#071224] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold uppercase text-slate-400">
                          {template.section}
                        </p>

                        <h3 className="mt-1 text-xl font-black text-white">
                          {template.title}
                        </h3>

                        <p className="mt-2 text-sm text-slate-300">
                          {template.observation}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => insertTemplate(template.id)}
                        className="rounded-xl bg-yellow-500 px-5 py-3 font-black text-slate-950 hover:bg-yellow-400 disabled:opacity-60"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && (
                  <div className="rounded-2xl border border-slate-700 bg-[#071224] p-6 text-center text-slate-400">
                    No matching templates found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
