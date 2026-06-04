"use client";

import { useState } from "react";

export default function DeleteSummaryButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [deleting, setDeleting] = useState(false);

  async function deleteSummary() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    const confirmed = window.confirm(
      "Delete the Executive Summary for this report?"
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const res = await fetch("/api/delete-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to delete summary.");
        return;
      }

      alert("Executive Summary deleted.");
      window.location.reload();
    } catch (error: any) {
      alert(error?.message || "Failed to delete summary.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={deleteSummary}
      disabled={deleting}
      className="rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {deleting ? "Deleting..." : "Delete Summary"}
    </button>
  );
}
