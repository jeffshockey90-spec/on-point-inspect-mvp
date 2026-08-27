"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

type SortMode = "favorites" | "recent" | "used" | "newest";

type CommentForm = {
  title: string;
  section: string;
  severity: string;
  observation: string;
  implication: string;
  recommendation: string;
  tags: string;
};

const emptyForm: CommentForm = {
  title: "",
  section: "Exterior",
  severity: "Recommended Repair",
  observation: "",
  implication: "",
  recommendation: "",
  tags: "",
};

function getCommentForm(comment: any): CommentForm {
  return {
    title: comment?.title || "",
    section: comment?.section || "Exterior",
    severity: comment?.severity || "Recommended Repair",
    observation: comment?.observation || "",
    implication: comment?.implication || "",
    recommendation: comment?.recommendation || "",
    tags: comment?.tags || "",
  };
}

function includesText(value: any, search: string) {
  return String(value || "").toLowerCase().includes(search);
}

function sortTemplates(items: any[], sortMode: SortMode) {
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

export default function CommentLibrary({
  onUseComment,
}: {
  onUseComment: (comment: any) => void;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("favorites");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CommentForm>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadComments();
  }, []);

  async function loadComments() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("finding_templates")
      .select("*")
      .order("is_favorite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("usage_count", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setComments(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    const matches = comments.filter((comment) => {
      if (favoritesOnly && !comment.is_favorite) return false;
      if (sectionFilter !== "All" && comment.section !== sectionFilter) return false;
      if (severityFilter !== "All" && comment.severity !== severityFilter) return false;

      if (!cleanSearch) return true;

      return (
        includesText(comment.title, cleanSearch) ||
        includesText(comment.section, cleanSearch) ||
        includesText(comment.severity, cleanSearch) ||
        includesText(comment.observation, cleanSearch) ||
        includesText(comment.implication, cleanSearch) ||
        includesText(comment.recommendation, cleanSearch) ||
        includesText(comment.tags, cleanSearch)
      );
    });

    return sortTemplates(matches, sortMode);
  }, [comments, favoritesOnly, search, sectionFilter, severityFilter, sortMode]);

  function startEditing(comment: any) {
    setMessage("");
    setEditingId(String(comment.id));
    setEditForm(getCommentForm(comment));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(emptyForm);
    setSavingId(null);
  }

  function updateForm(key: keyof CommentForm, value: string) {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveEdit(comment: any) {
    if (!editingId || savingId) return;

    if (!editForm.title.trim()) {
      alert("Comment title is required.");
      return;
    }

    setSavingId(String(comment.id));
    setMessage("");

    const updatePayload = {
      title: editForm.title.trim(),
      section: editForm.section,
      severity: editForm.severity,
      observation: editForm.observation.trim(),
      implication: editForm.implication.trim(),
      recommendation: editForm.recommendation.trim(),
      tags: editForm.tags.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("finding_templates")
      .update(updatePayload)
      .eq("id", comment.id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to update comment.");
      setSavingId(null);
      return;
    }

    setComments((current) =>
      current.map((item) => (item.id === comment.id ? data : item))
    );

    setMessage("Comment updated.");
    setSavingId(null);
    cancelEditing();
  }

  async function deleteComment(comment: any) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `Delete "${comment.title || "this comment"}" from your comment library? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(String(comment.id));
    setMessage("");

    const { error } = await supabase
      .from("finding_templates")
      .delete()
      .eq("id", comment.id);

    if (error) {
      alert(error.message || "Failed to delete comment.");
      setDeletingId(null);
      return;
    }

    setComments((current) => current.filter((item) => item.id !== comment.id));
    setMessage("Comment deleted.");
    setDeletingId(null);

    if (editingId === String(comment.id)) {
      cancelEditing();
    }
  }

  async function toggleFavorite(comment: any) {
    if (favoriteBusyId) return;

    const nextFavorite = !Boolean(comment.is_favorite);
    setFavoriteBusyId(String(comment.id));
    setMessage("");

    setComments((current) =>
      current.map((item) =>
        item.id === comment.id ? { ...item, is_favorite: nextFavorite } : item
      )
    );

    const { data, error } = await supabase
      .from("finding_templates")
      .update({
        is_favorite: nextFavorite,
        updated_at: new Date().toISOString(),
      })
      .eq("id", comment.id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to update favorite.");
      await loadComments();
      setFavoriteBusyId(null);
      return;
    }

    setComments((current) =>
      current.map((item) => (item.id === comment.id ? data : item))
    );

    setFavoriteBusyId(null);
  }

  async function useComment(comment: any) {
    if (usingId) return;

    setUsingId(String(comment.id));

    const nextUsageCount = Number(comment.usage_count || 0) + 1;
    const now = new Date().toISOString();

    setComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? { ...item, usage_count: nextUsageCount, last_used_at: now }
          : item
      )
    );

    onUseComment(comment);

    await supabase
      .from("finding_templates")
      .update({
        usage_count: nextUsageCount,
        last_used_at: now,
        updated_at: now,
      })
      .eq("id", comment.id);

    window.setTimeout(() => setUsingId(null), 250);
  }

  return (
    <div className="rounded-2xl border border-[#232b38] bg-[#10151e] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Comment Library
          </h2>

          <p className="mt-1 text-sm text-[#8a93a3]">
            Search, favorite, use, edit, or delete your saved finding templates.
          </p>
        </div>

        <button
          type="button"
          onClick={loadComments}
          disabled={loading}
          className="rounded-lg border border-[#232b38] px-3 py-2 text-xs font-semibold text-[#e8ecf3] transition active:scale-[0.98] hover:bg-[#1a212c] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-green-500/40 bg-green-950/30 p-3 text-sm font-bold text-green-300">
          {message}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search saved comments..."
          className="w-full rounded-xl border border-[#232b38] bg-black p-3 text-white outline-none focus:border-teal-400"
        />

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="w-full rounded-xl border border-[#232b38] bg-black p-3 text-white outline-none focus:border-teal-400"
        >
          <option value="All">All Sections</option>
          {SECTIONS.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="w-full rounded-xl border border-[#232b38] bg-black p-3 text-white outline-none focus:border-teal-400"
        >
          <option value="All">All Severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="w-full rounded-xl border border-[#232b38] bg-black p-3 text-white outline-none focus:border-teal-400"
        >
          <option value="favorites">Favorites First</option>
          <option value="recent">Recently Used</option>
          <option value="used">Most Used</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFavoritesOnly((current) => !current)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-[0.98] [touch-action:manipulation] ${
            favoritesOnly
              ? "border-yellow-400 bg-yellow-400 text-slate-950"
              : "border-yellow-500/50 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
          }`}
        >
          {favoritesOnly ? "★ Favorites Only" : "☆ Show Favorites Only"}
        </button>

        <p className="text-sm text-[#8a93a3]">
          Showing {filtered.length} of {comments.length}
        </p>
      </div>

      {loading ? (
        <p className="mt-4 rounded-xl border border-[#232b38] bg-black p-4 text-[#8a93a3]">
          Loading comments...
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[#232b38] bg-black p-4 text-[#8a93a3]">
          No saved comments found.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((comment) => {
            const isEditing = editingId === String(comment.id);
            const isSaving = savingId === String(comment.id);
            const isDeleting = deletingId === String(comment.id);
            const isFavoriteBusy = favoriteBusyId === String(comment.id);
            const isUsing = usingId === String(comment.id);

            return (
              <div
                key={comment.id}
                className={`rounded-xl border p-4 ${
                  comment.is_favorite
                    ? "border-yellow-500/60 bg-yellow-500/10"
                    : "border-[#232b38] bg-black"
                }`}
              >
                {!isEditing ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white">
                          {comment.title || "Untitled Comment"}
                        </p>

                        <p className="mt-1 text-sm text-[#8a93a3]">
                          {comment.section || "No Section"} •{" "}
                          {comment.severity || "No Severity"}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                          {comment.is_favorite && (
                            <span className="rounded-full border border-yellow-400/60 bg-yellow-400/10 px-2 py-1 text-yellow-300">
                              ★ Favorite
                            </span>
                          )}

                          <span className="rounded-full border border-[#232b38] px-2 py-1 text-[#8a93a3]">
                            Used {Number(comment.usage_count || 0)} time
                            {Number(comment.usage_count || 0) === 1 ? "" : "s"}
                          </span>

                          {comment.tags && (
                            <span className="rounded-full border border-teal-500/50 bg-teal-500/10 px-2 py-1 text-teal-300">
                              {comment.tags}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(comment)}
                        disabled={isFavoriteBusy || isDeleting}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation] ${
                          comment.is_favorite
                            ? "border-yellow-400 bg-yellow-400 text-slate-950"
                            : "border-yellow-500/60 text-yellow-300 hover:bg-yellow-500/10"
                        }`}
                      >
                        {isFavoriteBusy
                          ? "Saving..."
                          : comment.is_favorite
                            ? "★ Favorited"
                            : "☆ Favorite"}
                      </button>
                    </div>

                    {comment.observation && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#8a93a3]">
                        {comment.observation}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => useComment(comment)}
                        disabled={isUsing || isDeleting}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {isUsing ? "Using..." : "Use Comment"}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditing(comment)}
                        disabled={isDeleting || isUsing}
                        className="rounded-lg border border-blue-500 px-4 py-2 text-sm font-bold text-blue-300 transition active:scale-[0.98] hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteComment(comment)}
                        disabled={isDeleting || isUsing}
                        className="rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                        Title
                      </label>
                      <input
                        value={editForm.title}
                        onChange={(e) => updateForm("title", e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                          Section
                        </label>
                        <select
                          value={editForm.section}
                          onChange={(e) =>
                            updateForm("section", e.target.value)
                          }
                          disabled={isSaving}
                          className="w-full rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                          Severity
                        </label>
                        <select
                          value={editForm.severity}
                          onChange={(e) =>
                            updateForm("severity", e.target.value)
                          }
                          disabled={isSaving}
                          className="w-full rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {SEVERITIES.map((severity) => (
                            <option key={severity} value={severity}>
                              {severity}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <EditTextArea
                      label="Observation"
                      value={editForm.observation}
                      onChange={(value) => updateForm("observation", value)}
                      disabled={isSaving}
                    />

                    <EditTextArea
                      label="Implication"
                      value={editForm.implication}
                      onChange={(value) => updateForm("implication", value)}
                      disabled={isSaving}
                    />

                    <EditTextArea
                      label="Recommendation"
                      value={editForm.recommendation}
                      onChange={(value) => updateForm("recommendation", value)}
                      disabled={isSaving}
                    />

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                        Tags
                      </label>
                      <input
                        value={editForm.tags}
                        onChange={(e) => updateForm("tags", e.target.value)}
                        disabled={isSaving}
                        placeholder="Optional tags"
                        className="w-full rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(comment)}
                        disabled={isSaving}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="rounded-lg border border-[#232b38] px-4 py-2 text-sm font-bold text-[#e8ecf3] transition active:scale-[0.98] hover:bg-[#1a212c] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditTextArea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className="w-full rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 leading-6 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
