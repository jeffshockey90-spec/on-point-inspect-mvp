"use client";

export default function PrintPDFButton() {
  return (
    <div className="mb-8 flex flex-wrap gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-teal-600 px-6 py-3 font-bold text-white hover:bg-teal-500"
      >
        Download / Save PDF
      </button>

      <button
        type="button"
        onClick={() => window.history.back()}
        className="rounded-xl border border-slate-400 px-6 py-3 font-bold text-slate-700 hover:bg-slate-100"
      >
        Back to Report
      </button>
    </div>
  );
}