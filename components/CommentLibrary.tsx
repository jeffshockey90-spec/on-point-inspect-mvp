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
    tags: Array.isArray(comment?.tags)
      ? comment.tags.join(", ")
      : comment?.tags || "",
  };
}

export default function CommentLibrary({
  onUseComment,
}: {
  onUseComment: (comment: any) => void;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CommentForm>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadComments();
  }, []);

  async function loadComments() {
    setLoading(true);

    const { data, error } = await supabase
      .from("comment_library")
      .select("*")
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
    return comments.filter((comment) => {
      const text = `
        ${comment.title || ""}
        ${comment.section || ""}
        ${comment.severity || ""}
        ${comment.observation || ""}
        ${comment.implication || ""}
        ${comment.recommendation || ""}
        ${comment.tags || ""}
      `.toLowerCase();

      return text.includes(search.toLowerCase());
    });
  }, [comments, search]);

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
      .from("comment_library")
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
      .from("comment_library")
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

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-400">
            Comment Library
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Search, use, edit, or delete your saved report comments.
          </p>
        </div>

        <button
          type="button"
          onClick={loadComments}
          disabled={loading}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-slate-200 transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-green-500/40 bg-green-950/30 p-3 text-sm font-bold text-green-300">
          {message}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search saved comments..."
        className="mb-4 w-full rounded-xl border border-slate-700 bg-black p-3 text-white outline-none focus:border-teal-400"
      />

      {loading ? (
        <p className="rounded-xl border border-slate-700 bg-black p-4 text-slate-400">
          Loading comments...
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-700 bg-black p-4 text-slate-400">
          No saved comments found.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((comment) => {
            const isEditing = editingId === String(comment.id);
            const isSaving = savingId === String(comment.id);
            const isDeleting = deletingId === String(comment.id);

            return (
              <div
                key={comment.id}
                className="rounded-xl border border-slate-700 bg-black p-4"
              >
                {!isEditing ? (
                  <>
                    <p className="font-bold text-white">
                      {comment.title || "Untitled Comment"}
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      {comment.section || "No Section"} •{" "}
                      {comment.severity || "No Severity"}
                    </p>

                    {comment.observation && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
                        {comment.observation}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onUseComment(comment)}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black transition active:scale-[0.98] hover:bg-teal-400 [touch-action:manipulation]"
                      >
                        Use Comment
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditing(comment)}
                        disabled={isDeleting}
                        className="rounded-lg border border-blue-500 px-4 py-2 text-sm font-bold text-blue-300 transition active:scale-[0.98] hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteComment(comment)}
                        disabled={isDeleting}
                        className="rounded-lg border border-red-600 px-4 py-2 text-sm font-black text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                        Title
                      </label>
                      <input
                        value={editForm.title}
                        onChange={(e) => updateForm("title", e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                          Section
                        </label>
                        <select
                          value={editForm.section}
                          onChange={(e) =>
                            updateForm("section", e.target.value)
                          }
                          disabled={isSaving}
                          className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                          Severity
                        </label>
                        <select
                          value={editForm.severity}
                          onChange={(e) =>
                            updateForm("severity", e.target.value)
                          }
                          disabled={isSaving}
                          className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
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
                      <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                        Tags
                      </label>
                      <input
                        value={editForm.tags}
                        onChange={(e) => updateForm("tags", e.target.value)}
                        disabled={isSaving}
                        placeholder="Optional tags"
                        className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(comment)}
                        disabled={isSaving}
                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-black text-black transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition active:scale-[0.98] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
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
      <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 leading-6 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
