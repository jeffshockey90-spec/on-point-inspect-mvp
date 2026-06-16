"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type FindingTemplate = Record<string, any>;
type SortMode = "favorites" | "recent" | "used" | "newest";

function templateMatches(template: FindingTemplate, search: string) {
  const cleanSearch = search.trim().toLowerCase();
  if (!cleanSearch) return true;

  const text = `
    ${template.title || ""}
    ${template.section || ""}
    ${template.severity || ""}
    ${template.observation || ""}
    ${template.implication || ""}
    ${template.recommendation || ""}
    ${template.tags || ""}
  `.toLowerCase();

  return text.includes(cleanSearch);
}

function sortTemplates(items: FindingTemplate[], sortMode: SortMode) {
  const copy = [...items];

  return copy.sort((a, b) => {
    if (sortMode === "favorites") {
      const favoriteDiff = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
      if (favoriteDiff !== 0) return favoriteDiff;
    }

    if (sortMode === "used") {
      const usageDiff = Number(b.usage_count || 0) - Number(a.usage_count || 0);
      if (usageDiff !== 0) return usageDiff;
    }

    if (sortMode === "recent") {
      const recentA = new Date(a.last_used_at || a.updated_at || a.created_at || 0).getTime();
      const recentB = new Date(b.last_used_at || b.updated_at || b.created_at || 0).getTime();
      return recentB - recentA;
    }

    const createdA = new Date(a.created_at || 0).getTime();
    const createdB = new Date(b.created_at || 0).getTime();
    return createdB - createdA;
  });
}

export default function InsertFavoriteFindingButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FindingTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("favorites");
  const [favoritesOnly, setFavoritesOnly] = useState(true);
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

      setTemplates((current) =>
        current.map((template) =>
          String(template.id) === templateId
            ? {
                ...template,
                usage_count: Number(template.usage_count || 0) + 1,
                last_used_at: new Date().toISOString(),
              }
            : template
        )
      );

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
    const matching = templates.filter((template) => {
      if (favoritesOnly && !template.is_favorite) return false;
      return templateMatches(template, search);
    });

    return sortTemplates(matching, sortMode);
  }, [favoritesOnly, search, sortMode, templates]);

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
                <div>
                  <h2 className="text-2xl font-black text-yellow-300">
                    Insert Favorite Finding
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Search saved finding templates and insert one into this report.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition active:scale-[0.98] hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_0.5fr_auto]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search findings..."
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="favorites">Favorites First</option>
                  <option value="recent">Recently Used</option>
                  <option value="used">Most Used</option>
                  <option value="newest">Newest</option>
                </select>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFavoritesOnly((current) => !current)}
                  className={`rounded-xl border px-4 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation] ${
                    favoritesOnly
                      ? "border-yellow-400 bg-yellow-400 text-slate-950"
                      : "border-yellow-500/50 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                  }`}
                >
                  {favoritesOnly ? "★ Favorites" : "All Templates"}
                </button>
              </div>
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
                        className={`rounded-2xl border p-5 ${
                          template.is_favorite
                            ? "border-yellow-500/60 bg-yellow-500/10"
                            : "border-slate-700 bg-[#071224]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-2 text-xs font-bold">
                              <span className="rounded-full border border-slate-600 px-2 py-1 uppercase text-slate-300">
                                {template.section || "Inspection Details"}
                              </span>

                              {template.is_favorite && (
                                <span className="rounded-full border border-yellow-400/60 bg-yellow-400/10 px-2 py-1 text-yellow-300">
                                  ★ Favorite
                                </span>
                              )}

                              <span className="rounded-full border border-slate-600 px-2 py-1 text-slate-300">
                                Used {Number(template.usage_count || 0)}
                              </span>
                            </div>

                            <h3 className="mt-3 text-xl font-black text-white">
                              {template.title || "Untitled Finding"}
                            </h3>

                            {template.observation && (
                              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-300">
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
