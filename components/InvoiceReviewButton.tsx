"use client";

import { useState } from "react";

// Send a Google review request to the person a standalone invoice was billed to
// (email + best-effort text). Shown on invoices that have been sent/paid so you
// can ask the people you've invoiced for a review.
export default function InvoiceReviewButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);

  async function sendReview() {
    if (loading) return;
    if (!confirm("Send a Google review request to this client?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      onClick={sendReview}
      disabled={loading}
      className="whitespace-nowrap rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-semibold text-[var(--fl-warn-text)] transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
    >
      {loading ? "Sending…" : "⭐ Ask for review"}
    </button>
  );
}
