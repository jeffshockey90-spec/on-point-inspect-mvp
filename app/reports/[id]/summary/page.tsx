"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ReportSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const reportId = resolvedParams.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");

  useEffect(() => {
    async function generateSummary() {
      try {
        const response = await fetch(`/api/report-summary?id=${reportId}`);
        const data = await response.json();

        const generatedSummary =
          data.summary || data.error || "No summary generated.";

        setSummary(generatedSummary);

        if (data.summary) {
          localStorage.setItem(
            `ai-realtor-summary-${reportId}`,
            generatedSummary
          );

          setTimeout(() => {
            router.push(`/reports/${reportId}`);
          }, 900);
        }
      } catch (error) {
        console.error(error);
        setSummary("Failed to generate summary.");
      } finally {
        setLoading(false);
      }
    }

    generateSummary();
  }, [reportId, router]);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold text-teal-400">
            AI Inspection Summary
          </h1>

          <Link
            href={`/reports/${reportId}`}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Report
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-[#071224] p-8 shadow-xl">
          {loading ? (
            <p className="text-lg text-slate-300">
              Generating AI summary...
            </p>
          ) : (
            <>
              <p className="mb-4 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-teal-300">
                Summary saved. Returning to the report...
              </p>

              <div className="whitespace-pre-line text-lg leading-8 text-slate-200">
                {summary}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
