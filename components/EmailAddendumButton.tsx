"use client";

import { useState } from "react";

export default function EmailAddendumButton({
  token,
  ready = false,
}: {
  token: string;
  ready?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function emailAddendum() {
    if (sending || !token) return;

    try {
      setSending(true);
      setMessage("");

      const response = await fetch(
        `/api/repair-request-addendum/${encodeURIComponent(token)}`,
        {
          method: "POST",
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not email addendum.");
      }

      setMessage(payload?.message || "Addendum emailed.");
    } catch (error: any) {
      setMessage(error?.message || "Could not email addendum.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={emailAddendum}
        disabled={sending}
        data-fast-click="true"
        className="min-h-[48px] w-full rounded-xl border border-cyan-400 px-4 py-3 text-center font-semibold text-[var(--fl-info-text)] transition hover:bg-cyan-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending
          ? "Emailing..."
          : ready
          ? "Email Addendum"
          : "Email Draft Addendum"}
      </button>

      {message ? (
        <p className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-[var(--fl-info-text)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
