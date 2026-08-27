"use client";

export default function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-teal-400 px-5 py-3 font-semibold text-slate-950 shadow-lg transition hover:bg-teal-300 print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
