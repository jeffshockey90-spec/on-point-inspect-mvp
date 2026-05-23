"use client";

export default function PrintSummaryButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-white px-5 py-3 font-bold text-black transition hover:bg-slate-200 print:hidden"
    >
      Print / Save PDF
    </button>
  );
}