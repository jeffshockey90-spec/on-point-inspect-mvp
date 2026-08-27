"use client";

import { formatAppValue } from "../../../../lib/app-time";
import { useEffect, useState } from "react";
import Link from "next/link";

type ChangelogEntry = {
  id: number;
  title: string;
  body: string;
  credited_user_name: string | null;
  published_at: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OwnerChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creditedUserName, setCreditedUserName] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCredited, setEditCredited] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setError("");
      const res = await fetch("/api/changelog/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load changelog.");
      setEntries(data.entries || []);
    } catch (err: any) {
      setError(err?.message || "Could not load changelog.");
    } finally {
      setLoading(false);
    }
  }

  async function submitEntry() {
    if (!body.trim() || posting) return;

    try {
      setPosting(true);
      setPostError("");

      const res = await fetch("/api/owner/changelog/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          creditedUserName: creditedUserName.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not post entry.");

      setTitle("");
      setBody("");
      setCreditedUserName("");
      await load();
    } catch (err: any) {
      setPostError(err?.message || "Could not post entry.");
    } finally {
      setPosting(false);
    }
  }

  function startEdit(entry: ChangelogEntry) {
    setEditingId(entry.id);
    setEditTitle(entry.title || "");
    setEditBody(entry.body || "");
    setEditCredited(entry.credited_user_name || "");
  }

  async function saveEdit(id: number) {
    if (!editBody.trim() || savingEdit) return;
    try {
      setSavingEdit(true);
      const res = await fetch(`/api/owner/changelog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          body: editBody.trim(),
          creditedUserName: editCredited.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not update entry.");
      setEditingId(null);
      await load();
    } catch (err: any) {
      alert(err?.message || "Could not update entry.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEntry(id: number) {
    if (!window.confirm("Delete this changelog post? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/owner/changelog/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete entry.");
      await load();
    } catch (err: any) {
      alert(err?.message || "Could not delete entry.");
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">What's New</p>
              <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Changelog</h1>
              <p className="mt-4 text-[var(--fl-muted)]">Post updates so inspectors know what shipped. Everyone gets notified.</p>
            </div>
            <Link href="/dashboard/owner/suggestions" className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10">
              Suggestions
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl">
          <h2 className="text-xl font-semibold text-[var(--fl-text)]">Post an Update</h2>

          {postError && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs font-bold text-[var(--fl-crit-text)]">
              {postError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title, e.g. Custom section fields (leave blank to auto-number, e.g. update 1.9.10)"
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What changed and why it matters..."
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <input
              value={creditedUserName}
              onChange={(e) => setCreditedUserName(e.target.value)}
              placeholder="Credit someone (optional)"
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <button
              onClick={submitEntry}
              disabled={!body.trim() || posting}
              className="w-full rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {posting ? "Posting..." : "Publish Update"}
            </button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-[var(--fl-crit-text)]">{error}</div>}

        <div className="space-y-4">
          {loading ? (
            <p className="text-[var(--fl-muted)]">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 text-center text-[var(--fl-muted)]">
              No entries yet.
            </p>
          ) : (
            entries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    <input
                      value={editCredited}
                      onChange={(e) => setEditCredited(e.target.value)}
                      placeholder="Credit someone (optional)"
                      className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => saveEdit(entry.id)}
                        disabled={!editBody.trim() || savingEdit}
                        className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-[var(--fl-line)] px-5 py-2.5 text-sm font-semibold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">{formatDate(entry.published_at)}</p>
                      <div className="flex items-center gap-2">
                        {entry.credited_user_name && (
                          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-[var(--fl-warn-text)]">
                            ✨ Requested by {entry.credited_user_name}
                          </span>
                        )}
                        <button
                          onClick={() => startEdit(entry)}
                          className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-muted)] hover:border-teal-400 hover:text-[var(--fl-accent-text)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-[var(--fl-crit-text)] hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">{entry.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--fl-muted)]">{entry.body}</p>
                  </>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
