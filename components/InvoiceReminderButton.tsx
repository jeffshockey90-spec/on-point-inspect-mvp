"use client";

import { useState } from "react";
import { flowConfirm, flowAlert } from "./ConfirmProvider";

export default function InvoiceReminderButton({
  inspectionId,
}: {
  inspectionId: number | string;
}) {
  const [loading, setLoading] = useState(false);

  async function sendReminder() {
    if (!await flowConfirm("Send a payment reminder to all clients on this inspection?")) return;

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
        await flowAlert(data.error || "Could not send reminder email.");
        return;
      }

      const count = Number(data?.sent) || 0;
      await flowAlert(
        count > 1
          ? `Payment reminder sent to ${count} clients.`
          : "Payment reminder sent.",
      );
    } catch {
      await flowAlert("Could not send reminder email.");
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
