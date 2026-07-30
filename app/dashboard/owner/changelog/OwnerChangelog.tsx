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
    if (!title.trim() || !body.trim() || posting) return;

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

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">What's New</p>
              <h1 className="mt-3 text-4xl font-black md:text-5xl">Changelog</h1>
              <p className="mt-4 text-slate-300">Post updates so inspectors know what shipped. Everyone gets notified.</p>
            </div>
            <Link href="/dashboard/owner/suggestions" className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 hover:bg-teal-500/10">
              Suggestions
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
          <h2 className="text-xl font-black text-white">Post an Update</h2>

          {postError && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 p-2 text-xs font-bold text-red-300">
              {postError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title, e.g. Custom section fields"
              className="w-full rounded-xl border border-slate-700 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-teal-400"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What changed and why it matters..."
              className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-sm text-white outline-none focus:border-teal-400"
            />
            <input
              value={creditedUserName}
              onChange={(e) => setCreditedUserName(e.target.value)}
              placeholder="Credit someone (optional)"
              className="w-full rounded-xl border border-slate-700 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-teal-400"
            />
            <button
              onClick={submitEntry}
              disabled={!title.trim() || !body.trim() || posting}
              className="w-full rounded-xl bg-teal-500 px-5 py-3 font-black text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {posting ? "Posting..." : "Publish Update"}
            </button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm font-bold text-red-300">{error}</div>}

        <div className="space-y-4">
          {loading ? (
            <p className="text-slate-400">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="rounded-xl border border-slate-700 bg-[#0f172a] p-6 text-center text-slate-400">
              No entries yet.
            </p>
          ) : (
            entries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-teal-400">{formatDate(entry.published_at)}</p>
                  {entry.credited_user_name && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">
                      ✨ Requested by {entry.credited_user_name}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-xl font-black text-white">{entry.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{entry.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
