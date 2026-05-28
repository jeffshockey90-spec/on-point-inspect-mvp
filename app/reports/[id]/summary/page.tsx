"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function ReportSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: reportId } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");

  async function generateSummary() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/report-summary?id=${reportId}`);
      const data = await response.json();

      setSummary(data.summary || data.error || "No summary generated.");
    } catch (error: any) {
      setSummary(error?.message || "Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSummaryToReport() {
    if (!summary.trim()) {
      alert("No summary to save.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/report-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: reportId,
          summary,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not save summary.");
        return;
      }

      setMessage("Report Summary saved to the report.");
    } catch (error: any) {
      alert(error?.message || "Could not save summary.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    generateSummary();
  }, [reportId]);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl font-extrabold text-teal-400">
            Report Summary
          </h1>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateSummary}
              disabled={loading || saving}
              className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10 disabled:opacity-60"
            >
              {loading ? "Generating..." : "Regenerate"}
            </button>

            <button
              type="button"
              onClick={saveSummaryToReport}
              disabled={loading || saving || !summary.trim()}
              className="rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Summary to Report"}
            </button>

            <Link
              href={`/reports/${reportId}`}
              className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
            >
              Back to Report
            </Link>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-5 py-4 font-bold text-teal-300">
            {message}
          </div>
        )}

        <div className="rounded-2xl border border-slate-700 bg-[#071224] p-8 shadow-xl">
          {loading ? (
            <p className="text-lg text-slate-300">
              Generating defect-focused report summary...
            </p>
          ) : (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={18}
              className="w-full rounded-xl border border-slate-700 bg-[#020817] p-5 text-lg leading-8 text-slate-100 outline-none focus:border-teal-400"
            />
          )}
        </div>
      </div>
    </main>
  );
}