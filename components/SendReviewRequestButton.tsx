"use client";

import { useState } from "react";

export default function SendReviewRequestButton({
  inspectionId,
  clientEmail,
  clientEmails,
  realtorEmail,
  reviewStatus,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  clientEmails?: string[] | null;
  realtorEmail?: string | null;
  reviewStatus?: string | null;
}) {
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  const alreadyRequested = String(reviewStatus || "")
    .toLowerCase()
    .includes("requested");

  const hasAgent = Boolean(realtorEmail);

  // All buyers on the inspection (primary + co-buyers). Fall back to the single
  // primary email if the fuller list wasn't provided.
  const buyerEmails = (
    clientEmails && clientEmails.length > 0
      ? clientEmails
      : [clientEmail || ""]
  ).filter(Boolean);
  const hasBuyer = buyerEmails.length > 0;
  const multipleBuyers = buyerEmails.length > 1;

  async function send(recipientType: "client" | "realtor") {
    setOpen(false);

    let confirmMessage: string;
    if (recipientType === "realtor") {
      confirmMessage = `Send a Google review request to the agent${
        realtorEmail ? ` (${realtorEmail})` : ""
      }?`;
    } else if (multipleBuyers) {
      confirmMessage = `Send a Google review request to all ${buyerEmails.length} buyers?\n\n${buyerEmails.join(
        "\n"
      )}`;
    } else {
      confirmMessage = `Send a Google review request to the client${
        buyerEmails[0] ? ` (${buyerEmails[0]})` : ""
      }?`;
    }

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setSending(true);

    try {
      const res = await fetch("/api/send-review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // For the client path we intentionally omit recipientEmail so the
        // server fans out to every buyer contact (primary + co-buyers). For the
        // agent path we target the specific agent email.
        body: JSON.stringify({
          inspectionId,
          recipientType,
          recipientEmail: recipientType === "realtor" ? realtorEmail || "" : "",
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
    "rounded-xl border border-yellow-500 px-5 py-3 font-bold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-60";

  // No agent on file: keep the original single-button behavior (buyer review).
  if (!hasAgent) {
    return (
      <button
        type="button"
        onClick={() => send("client")}
        disabled={sending || !hasBuyer}
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
          <div className="absolute left-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-1 shadow-2xl">
            <button
              type="button"
              onClick={() => send("client")}
              disabled={!hasBuyer}
              className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-[var(--fl-text)]">
                {multipleBuyers ? `Ask the buyers (${buyerEmails.length})` : "Ask the client"}
              </span>
              {hasBuyer ? (
                buyerEmails.map((email) => (
                  <span key={email} className="block truncate text-xs text-[var(--fl-muted)]">
                    {email}
                  </span>
                ))
              ) : (
                <span className="block truncate text-xs text-[var(--fl-muted)]">
                  No buyer email on file
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => send("realtor")}
              className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[var(--fl-raised)]"
            >
              <span className="block text-sm font-semibold text-[var(--fl-text)]">Ask the agent</span>
              <span className="block truncate text-xs text-[var(--fl-muted)]">{realtorEmail}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
