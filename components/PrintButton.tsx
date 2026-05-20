"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-black px-5 py-3 font-bold text-white"
    >
      Print / Save PDF
    </button>
  );
}