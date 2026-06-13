"use client";

import { useState } from "react";

type PrintButtonProps = {
  label?: string;
  className?: string;
};

export default function PrintButton({
  label = "Print / Save PDF",
  className = "",
}: PrintButtonProps) {
  const [printing, setPrinting] = useState(false);

  function handlePrint() {
    if (printing) return;

    setPrinting(true);

    window.setTimeout(() => {
      window.print();

      window.setTimeout(() => {
        setPrinting(false);
      }, 1000);
    }, 50);
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={printing}
      aria-busy={printing}
      className={`${className} inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 [touch-action:manipulation]`}
    >
      {printing && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {printing ? "Opening Print..." : label}
    </button>
  );
}