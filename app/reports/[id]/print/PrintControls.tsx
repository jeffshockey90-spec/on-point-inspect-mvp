"use client";

export default function PrintControls({
  inspectionId,
}: {
  inspectionId: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-teal-600 px-6 py-3 font-bold text-white hover:bg-teal-500"
      >
        Download / Save PDF
      </button>

      <a
        href={`/reports/${inspectionId}`}
        className="rounded-xl border border-slate-400 px-6 py-3 font-bold text-slate-700 hover:bg-slate-100"
      >
        Back to Report
      </a>
    </div>
  );
}