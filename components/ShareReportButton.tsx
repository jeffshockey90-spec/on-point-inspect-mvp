"use client";

import { useState } from "react";

export default function ShareReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
    "idle"
  );

  async function copyLink() {
    if (status === "copying") return;

    setStatus("copying");

    try {
      const link = `${window.location.origin}/share/${inspectionId}`;

      await navigator.clipboard.writeText(link);

      setStatus("copied");

      window.setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Copy share link failed:", error);

      setStatus("error");

      window.setTimeout(() => {
        setStatus("idle");
      }, 2500);
    }
  }

  const label =
    status === "copying"
      ? "Copying..."
      : status === "copied"
        ? "Copied!"
        : status === "error"
          ? "Copy Failed"
          : "Copy Share Link";

  return (
    <button
      type="button"
      onClick={copyLink}
      disabled={status === "copying"}
      aria-busy={status === "copying"}
      className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-[var(--fl-info-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 hover:bg-blue-500 hover:text-black print:hidden"
    >
      {label}
    </button>
  );
}