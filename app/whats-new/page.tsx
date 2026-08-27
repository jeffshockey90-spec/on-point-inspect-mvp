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
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[#10151e] p-6 shadow-2xl md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-400">What's New</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Updates &amp; Features</h1>
          <p className="mt-4 max-w-2xl text-[#8a93a3]">
            Every new feature and fix that ships to FLOW. Got an idea? Submit it on the{" "}
            <a href="/support" className="text-teal-300 underline">
              suggestion box
            </a>
            .
          </p>
        </section>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm font-bold text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-[#8a93a3]">Loading updates...</p>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-[#232b38] bg-[#10151e] p-6 text-center text-[#8a93a3]">
            No updates posted yet.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-400">
                    {formatDate(entry.published_at)}
                  </p>
                  {entry.credited_user_name && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                      ✨ Requested by {entry.credited_user_name}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{entry.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#8a93a3]">
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
