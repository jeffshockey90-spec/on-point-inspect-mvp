"use client";

import { useState } from "react";

export default function PublishReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function publishReport() {
    const confirmed = confirm(
      "Publish this report and email it to all parties?"
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    const res = await fetch("/api/reports/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to publish report.");
      setLoading(false);
      return;
    }

    setMessage("Report published and emails sent.");
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={publishReport}
        disabled={loading}
        className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black transition hover:bg-green-400 disabled:opacity-50"
      >
        {loading ? "Publishing..." : "Publish Report"}
      </button>

      {message && (
        <p className="text-sm text-teal-300">
          {message}
        </p>
      )}
    </div>
  );
}