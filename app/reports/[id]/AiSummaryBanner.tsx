"use client";

import { useEffect, useState } from "react";

export default function AiSummaryBanner({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const storageKey = `ai-realtor-summary-${inspectionId}`;

  const [summary, setSummary] = useState("");

  useEffect(() => {
    const savedSummary = localStorage.getItem(storageKey);

    if (savedSummary) {
      setSummary(savedSummary);
    }

    function refreshSummary() {
      const updated = localStorage.getItem(storageKey);
      setSummary(updated || "");
    }

    window.addEventListener("storage", refreshSummary);
    window.addEventListener("focus", refreshSummary);

    return () => {
      window.removeEventListener("storage", refreshSummary);
      window.removeEventListener("focus", refreshSummary);
    };
  }, [storageKey]);

  if (!summary) return null;

  function clearSummary() {
    const confirmed = confirm(
      "Remove the AI summary from this report?"
    );

    if (!confirmed) return;

    localStorage.removeItem(storageKey);
    setSummary("");
  }

  return (
    <section className="mb-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-teal-300">
            Realtor AI Summary
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            AI-generated summary based on report findings.
          </p>
        </div>

        <button
          type="button"
          onClick={clearSummary}
          className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
        >
          Remove Summary
        </button>
      </div>

      <div className="whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
        {summary}
      </div>
    </section>
  );
}