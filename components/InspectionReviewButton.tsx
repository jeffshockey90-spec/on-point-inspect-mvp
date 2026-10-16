"use client";

import { useState } from "react";

// Send a Google review request to an inspection's client from the invoices page
// (same action as the report builder's review button). Uses the inspection
// review endpoint, which picks up the client contacts + the company review link.
export default function InspectionReviewButton({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const [loading, setLoading] = useState(false);

  async function send() {
    if (loading) return;
    if (!confirm("Send a Google review request to the client?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/send-review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Could not send the review request.");
        return;
      }
      alert(data?.message || "Review request sent.");
    } catch {
      alert("Could not send the review request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={loading}
      className="inline-flex rounded-lg border border-amber-500 px-3 py-2 text-xs font-semibold text-[var(--fl-warn-text)] transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
    >
      {loading ? "Sending…" : "⭐ Ask for review"}
    </button>
  );
}
