"use client";

import { useState } from "react";

// Re-send a standalone invoice (the one you build to bill a third party for the
// client's report) as a friendly payment reminder, to the same recipient(s) the
// invoice went to. Shown for sent-but-unpaid invoices.
export default function InvoiceRemindButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);

  async function sendReminder() {
    if (loading) return;
    if (!confirm("Send a payment reminder for this invoice?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminder: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Could not send the reminder.");
        return;
      }
      const count = Number(data?.sent) || 0;
      alert(count > 1 ? `Reminder sent to ${count} recipients.` : "Reminder sent.");
    } catch {
      alert("Could not send the reminder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReminder}
      disabled={loading}
      className="whitespace-nowrap rounded-lg border border-yellow-500 px-3 py-1.5 text-xs font-semibold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
    >
      {loading ? "Sending…" : "Send Reminder"}
    </button>
  );
}
