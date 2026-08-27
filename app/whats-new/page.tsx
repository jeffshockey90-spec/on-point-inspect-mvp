"use client";

import { formatAppValue } from "../../lib/app-time";
import { useEffect, useState } from "react";

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

export default function WhatsNewPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/changelog/list", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not load updates.");
        setEntries(data.entries || []);
      } catch (err: any) {
        setError(err?.message || "Could not load updates.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">What's New</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Updates &amp; Features</h1>
          <p className="mt-4 max-w-2xl text-[var(--fl-muted)]">
            Every new feature and fix that ships to FLOW. Got an idea? Submit it on the{" "}
            <a href="/support" className="text-[var(--fl-accent-text)] underline">
              suggestion box
            </a>
            .
          </p>
        </section>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-[var(--fl-muted)]">Loading updates...</p>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 text-center text-[var(--fl-muted)]">
            No updates posted yet.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                    {formatDate(entry.published_at)}
                  </p>
                  {entry.credited_user_name && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                      ✨ Requested by {entry.credited_user_name}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">{entry.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--fl-muted)]">
                  {entry.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
