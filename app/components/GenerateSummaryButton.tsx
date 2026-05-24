"use client";

import { useState } from "react";

export default function GenerateSummaryButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function generateSummary() {
    setLoading(true);

    const response = await fetch("/api/generate-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionId }),
    });

    const data = await response.json();

    setLoading(false);

    if (!data.summary) {
      alert(data.error || "Failed to generate summary");
      return;
    }

    window.location.reload();
  }

  return (
    <button
      onClick={generateSummary}
      disabled={loading}
      className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white transition hover:bg-purple-500 disabled:opacity-60"
    >
      {loading ? "Generating Summary..." : "Generate AI Summary"}
    </button>
  );
}