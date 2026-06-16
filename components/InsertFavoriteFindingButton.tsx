"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type FindingTemplate = Record<string, any>;

export default function InsertFavoriteFindingButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FindingTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  const busy = Boolean(insertingId) || isRefreshing;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadTemplates() {
      setLoadingTemplates(true);

      try {
        const res = await fetch("/api/get-finding-templates", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (Array.isArray(data)) {
          setTemplates(data);
        } else if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        } else {
          setTemplates([]);
        }
      } catch (error) {
        console.error("Failed to load templates:", error);
        if (!cancelled) setTemplates([]);
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function insertTemplate(templateId: string) {
    if (busy) return;

    if (!inspectionId || !templateId) {
      alert("Missing inspection or template ID.");
      return;
    }

    setInsertingId(templateId);
    setInsertedId(null);

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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Failed to insert template.");
        return;
      }

      setInsertedId(templateId);

      startTransition(() => {
        router.refresh();
      });

      window.setTimeout(() => {
        setOpen(false);
        setInsertedId(null);
      }, 450);
    } catch (error: any) {
      alert(error?.message || "Failed to insert template.");
    } finally {
      setInsertingId(null);
    }
  }

  const filtered = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return templates.filter((template) => {
      const text = `
        ${template.title || ""}
        ${template.section || ""}
        ${template.observation || ""}
        ${template.implication || ""}
        ${template.recommendation || ""}
      `.toLowerCase();

      return !cleanSearch || text.includes(cleanSearch);
    });
  }, [search, templates]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-xl border border-yellow-500 bg-yellow-500/10 px-5 py-3 font-bold text-yellow-300 transition active:scale-[0.98] hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
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
                  disabled={busy}
                  className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition active:scale-[0.98] hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                >
                  Close
                </button>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search findings..."
                disabled={busy}
                className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5">
              {loadingTemplates ? (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-[#071224] p-6 text-slate-300">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Loading favorite findings...
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map((template) => {
                    const templateId = String(template.id || "");
                    const isInserting = insertingId === templateId;
                    const wasInserted = insertedId === templateId;

                    return (
                      <div
                        key={templateId}
                        className="rounded-2xl border border-slate-700 bg-[#071224] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold uppercase text-slate-400">
                              {template.section || "Inspection Details"}
                            </p>

                            <h3 className="mt-1 text-xl font-black text-white">
                              {template.title || "Untitled Finding"}
                            </h3>

                            {template.observation && (
                              <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
                                {template.observation}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={busy || !templateId}
                            aria-busy={isInserting}
                            onClick={() => insertTemplate(templateId)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 font-black text-slate-950 transition active:scale-[0.98] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                          >
                            {isInserting && (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            )}
                            {isInserting
                              ? "Inserting..."
                              : wasInserted
                                ? "Inserted"
                                : "Insert"}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="rounded-2xl border border-slate-700 bg-[#071224] p-6 text-center text-slate-400">
                      No matching templates found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
