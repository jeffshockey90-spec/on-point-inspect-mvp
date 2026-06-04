"use client";

import { useState } from "react";

export default function SendReviewRequestButton({
  inspectionId,
  clientEmail,
  reviewStatus,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  reviewStatus?: string | null;
}) {
  const [sending, setSending] = useState(false);

  const alreadyRequested = String(reviewStatus || "")
    .toLowerCase()
    .includes("requested");

  async function sendReviewRequest() {
    const confirmed = window.confirm(
      alreadyRequested
        ? "A review request was already marked as requested. Send another one?"
        : "Send a Google review request to this client?"
    );

    if (!confirmed) return;

    setSending(true);

    try {
      const res = await fetch("/api/send-review-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientEmail: clientEmail || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Review request failed to send.");
        return;
      }

      alert(data.message || "Review request sent.");
      window.location.reload();
    } catch (error: any) {
      alert(error?.message || "Review request failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReviewRequest}
      disabled={sending}
      className="rounded-xl border border-yellow-500 px-5 py-3 font-bold text-yellow-300 transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {sending
        ? "Sending..."
        : alreadyRequested
          ? "Send Review Request Again"
          : "Request Review"}
    </button>
  );
}
