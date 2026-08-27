"use client";

import { useState } from "react";

export default function InvoiceReminderButton({
  inspectionId,
}: {
  inspectionId: number | string;
}) {
  const [loading, setLoading] = useState(false);

  async function sendReminder() {
    if (!confirm("Send invoice reminder email to this client?")) return;

    try {
      setLoading(true);

      const res = await fetch("/api/send-invoice-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not send reminder email.");
        return;
      }

      alert("Invoice reminder sent.");
    } catch {
      alert("Could not send reminder email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReminder}
      disabled={loading}
      className="rounded-lg border border-yellow-500 px-3 py-2 text-xs font-semibold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Sending..." : "Send Reminder"}
    </button>
  );
}
