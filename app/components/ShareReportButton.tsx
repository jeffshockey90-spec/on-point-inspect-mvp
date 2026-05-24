"use client";

import { useState } from "react";

export default function ShareReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const link = `${window.location.origin}/share/${inspectionId}`;

    await navigator.clipboard.writeText(link);

    setCopied(true);

    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 transition hover:bg-blue-500 hover:text-black print:hidden"
    >
      {copied ? "Copied!" : "Copy Share Link"}
    </button>
  );
}