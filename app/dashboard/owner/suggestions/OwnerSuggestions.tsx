"use client";

import { formatAppValue } from "../../../../lib/app-time";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FeatureRequest = {
  id: number;
  user_name: string | null;
  user_email: string | null;
  message: string;
  status: string;
  owner_note: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["new", "planned", "in_progress", "shipped", "declined"];

const STATUS_STYLES: Record<string, string> = {
  new: "border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
  planned: "border-purple-400/40 bg-purple-500/10 text-purple-300",
  in_progress: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  shipped: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  declined: "border-[var(--fl-faint)] bg-slate-500/10 text-[var(--fl-muted)]",
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

export default function OwnerSuggestions() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [publishTarget, setPublishTarget] = useState<FeatureRequest | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishBody, setPublishBody] = useState("");
  const [publishCredit, setPublishCredit] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [noteErrorId, setNoteErrorId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setError("");
      const res = await fetch("/api/owner/feature-requests/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load suggestions.");
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err?.message || "Could not load suggestions.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  async function updateStatus(id: number, status: string) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await fetch("/api/owner/feature-requests/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      load();
    }
  }

  function getNoteDraft(request: FeatureRequest) {
    return noteDrafts[request.id] ?? request.owner_note ?? "";
  }

  async function saveNote(request: FeatureRequest) {
    const note = getNoteDraft(request).trim();
    setSavingNoteId(request.id);
    setNoteErrorId(null);

    try {
      const res = await fetch("/api/owner/feature-requests/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, status: request.status, ownerNote: note }),
      });

      if (!res.ok) throw new Error();

      setRequests((prev) =>
        prev.map((r) => (r.id === request.id ? { ...r, owner_note: note } : r)),
      );
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    } catch {
      // Leave the draft in place so the owner can retry, but make sure
      // they know it didn't save rather than assuming it did.
      setNoteErrorId(request.id);
    } finally {
      setSavingNoteId(null);
    }
  }

  function openPublish(request: FeatureRequest) {
    setPublishTarget(request);
    setPublishTitle("");
    setPublishBody(request.message);
    setPublishCredit(true);
    setPublishError("");
  }

  async function submitPublish() {
    if (!publishTarget || !publishTitle.trim() || !publishBody.trim() || publishing) return;

    try {
      setPublishing(true);
      setPublishError("");

      const res = await fetch("/api/owner/changelog/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publishTitle.trim(),
          body: publishBody.trim(),
          creditedUserName: publishCredit ? publishTarget.user_name : null,
          featureRequestId: publishTarget.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not publish.");

      setPublishTarget(null);
      await load();
    } catch (err: any) {
      setPublishError(err?.message || "Could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Suggestion Box</p>
              <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Feature Requests</h1>
              <p className="mt-4 text-[var(--fl-muted)]">What inspectors are asking for, straight from the app.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/owner/changelog" className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10">
                Changelog
              </Link>
              <Link href="/dashboard/owner" className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-semibold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]">
                Owner Dashboard
              </Link>
            </div>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">{error}</div>}

        <div className="flex flex-wrap gap-2">
          {["all", ...STATUS_OPTIONS].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                filter === status
                  ? "border-teal-400 bg-teal-500/15 text-[var(--fl-accent-text)]"
                  : "border-[var(--fl-line)] bg-[var(--fl-surface)] text-[var(--fl-muted)] hover:border-teal-500/50"
              }`}
            >
              {status.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loading ? (
            <p className="text-[var(--fl-muted)]">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 text-center text-[var(--fl-muted)]">
              No suggestions here yet.
            </p>
          ) : (
            filtered.map((request) => (
              <div key={request.id} className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--fl-text)]">{request.user_name || "Inspector"}</p>
                    <p className="text-xs text-[var(--fl-muted)]">{request.user_email || "No email"} · {formatDate(request.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLES[request.status] || STATUS_STYLES.new}`}>
                    {request.status.replace("_", " ")}
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--fl-text)]">{request.message}</p>

                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                    Reply to {request.user_name || "this inspector"}
                  </p>
                  <textarea
                    value={getNoteDraft(request)}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [request.id]: e.target.value }))
                    }
                    rows={2}
                    placeholder="Optional note the inspector will see on their suggestion..."
                    className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
                  />
                  {getNoteDraft(request) !== (request.owner_note ?? "") && (
                    <button
                      onClick={() => saveNote(request)}
                      disabled={savingNoteId === request.id}
                      className="mt-2 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                    >
                      {savingNoteId === request.id ? "Saving..." : "Save Reply"}
                    </button>
                  )}
                  {noteErrorId === request.id && (
                    <p className="mt-2 text-xs font-bold text-red-400">
                      Could not save the reply. Try again.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(request.id, status)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        request.status === status
                          ? "border-teal-400 bg-teal-500/15 text-[var(--fl-accent-text)]"
                          : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:border-teal-500/50 hover:text-[var(--fl-accent-text)]"
                      }`}
                    >
                      {status.replace("_", " ")}
                    </button>
                  ))}

                  <button
                    onClick={() => openPublish(request)}
                    className="ml-auto rounded-lg bg-teal-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-teal-400"
                  >
                    Post to Changelog
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {publishTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--fl-text)]">Post to Changelog</h2>
              <button
                type="button"
                onClick={() => setPublishTarget(null)}
                className="rounded-lg border border-[var(--fl-line)] px-3 py-1 text-sm font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
              >
                Close
              </button>
            </div>

            {publishError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs font-bold text-red-300">
                {publishError}
              </p>
            )}

            <input
              value={publishTitle}
              onChange={(e) => setPublishTitle(e.target.value)}
              placeholder="Feature title, e.g. Custom section fields"
              className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />

            <textarea
              value={publishBody}
              onChange={(e) => setPublishBody(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />

            <label className="mt-3 flex items-center gap-2 text-sm font-bold text-[var(--fl-muted)]">
              <input
                type="checkbox"
                checked={publishCredit}
                onChange={(e) => setPublishCredit(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
              />
              Credit {publishTarget.user_name || "this inspector"}
            </label>

            <button
              type="button"
              onClick={submitPublish}
              disabled={!publishTitle.trim() || !publishBody.trim() || publishing}
              className="mt-4 w-full rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
