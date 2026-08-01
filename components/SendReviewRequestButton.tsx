"use client";

import { useState } from "react";

export default function SendReviewRequestButton({
  inspectionId,
  clientEmail,
  realtorEmail,
  reviewStatus,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
  reviewStatus?: string | null;
}) {
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  const alreadyRequested = String(reviewStatus || "")
    .toLowerCase()
    .includes("requested");

  const hasAgent = Boolean(realtorEmail);

  async function send(recipientType: "client" | "realtor") {
    setOpen(false);

    const label = recipientType === "realtor" ? "agent" : "client";
    const email = recipientType === "realtor" ? realtorEmail : clientEmail;

    const confirmed = window.confirm(
      `Send a Google review request to the ${label}${email ? ` (${email})` : ""}?`
    );

    if (!confirmed) return;

    setSending(true);

    try {
      const res = await fetch("/api/send-review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          recipientType,
          recipientEmail: email || "",
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

  const buttonClass =
    "rounded-xl border border-yellow-500 px-5 py-3 font-bold text-yellow-300 transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-60";

  // No agent on file: keep the original single-button behavior (client review).
  if (!hasAgent) {
    return (
      <button
        type="button"
        onClick={() => send("client")}
        disabled={sending}
        className={buttonClass}
      >
        {sending
          ? "Sending..."
          : alreadyRequested
            ? "Send Review Request Again"
            : "Request Review"}
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={sending}
        className={buttonClass}
      >
        {sending ? "Sending..." : "Request Review ▾"}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-700 bg-[#0b1220] p-1 shadow-2xl">
            <button
              type="button"
              onClick={() => send("client")}
              disabled={!clientEmail}
              className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-sm font-black text-white">Ask the client</span>
              <span className="block truncate text-xs text-slate-400">
                {clientEmail || "No client email on file"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => send("realtor")}
              className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-800"
            >
              <span className="block text-sm font-black text-white">Ask the agent</span>
              <span className="block truncate text-xs text-slate-400">{realtorEmail}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
