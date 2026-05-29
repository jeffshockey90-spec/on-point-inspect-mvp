"use client";

import { useState } from "react";

export default function SendAgreementButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [sending, setSending] = useState(false);

  async function sendAgreement() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/send-agreement-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          sendToAll: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send agreement.");
      }

      alert(`Sent ${data.sent?.length || 0} agreement/portal email(s).`);
    } catch (error: any) {
      alert(error.message || "Failed to send agreement.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendAgreement}
      disabled={sending}
      className="rounded-xl border border-emerald-500 bg-emerald-500/10 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {sending ? "Sending..." : "Send Agreements / Portal"}
    </button>
  );
}
