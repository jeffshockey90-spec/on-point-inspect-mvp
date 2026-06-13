"use client";

import { useState } from "react";

export default function SendAgreementButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [sending, setSending] = useState(false);
  const [label, setLabel] = useState("Send Client Agreement");

  async function sendAgreement() {
    if (sending) return;

    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setSending(true);
    setLabel("Sending...");

    try {
      const res = await fetch("/api/send-agreement-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send agreement.");
      }

      setLabel("Sent!");
      alert(
        `Sent ${
          data.sent?.length || 0
        } client agreement email(s). Realtors are not included on pre-inspection agreements.`
      );
    } catch (error: any) {
      setLabel("Failed");
      alert(error.message || "Failed to send agreement.");
    } finally {
      window.setTimeout(() => {
        setSending(false);
        setLabel("Send Client Agreement");
      }, 700);
    }
  }

  return (
    <button
      type="button"
      onClick={sendAgreement}
      disabled={sending}
      aria-busy={sending}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-emerald-500/10 px-5 py-3 font-bold text-emerald-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-500 hover:text-slate-950 [touch-action:manipulation]"
    >
      {sending && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {label}
    </button>
  );
}