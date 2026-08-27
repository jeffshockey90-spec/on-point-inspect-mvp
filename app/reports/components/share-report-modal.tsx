"use client";

import { useState } from "react";

export default function ShareReportModal({
  reportId,
}: {
  reportId: string;
}) {
  const [copied, setCopied] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "";

  const shareUrl = `${baseUrl}/share/${reportId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      alert("Could not copy link. You can manually copy it from the box.");
    }
  }

  return (
    <div className="rounded-2xl border border-[#1a212c] bg-[#131923] p-5">
      <h2 className="text-xl font-semibold text-white">
        Share Report
      </h2>

      <p className="mt-2 text-sm text-[#8a93a3]">
        Copy this public report link and send it to the client or realtor.
      </p>

      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          value={shareUrl}
          readOnly
          className="flex-1 rounded-lg border border-[#232b38] bg-[#0a0e13] p-3 text-white"
        />

        <button
          onClick={copyLink}
          className="rounded-lg bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400"
        >
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      <a
        href={shareUrl}
        target="_blank"
        className="mt-4 inline-block rounded-lg border border-[#232b38] px-4 py-2 text-sm font-semibold text-[#e8ecf3] hover:bg-[#1a212c]"
      >
        Open Shared Report
      </a>
    </div>
  );
}