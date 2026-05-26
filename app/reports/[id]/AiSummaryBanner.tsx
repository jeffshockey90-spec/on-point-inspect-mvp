"use client";

export default function AiSummaryBanner({
  summary,
}: {
  summary?: string | null;
}) {
  if (!summary) return null;

  return (
    <section className="mb-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
      <div className="mb-4">
        <h2 className="text-2xl font-extrabold text-teal-300">
          Report Summary
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Saved summary visible to the client and realtor when the report is shared.
        </p>
      </div>

      <div className="whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
        {summary}
      </div>
    </section>
  );
}