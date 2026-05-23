"use client";

export default function PdfExportButton() {
  function exportPdf() {
    window.print();
  }

  return (
    <button
      type="button"
      onClick={exportPdf}
      className="rounded-xl bg-white px-5 py-3 font-bold text-black transition hover:bg-slate-200 print:hidden"
    >
      Export PDF
    </button>
  );
}