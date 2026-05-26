"use client";

import { useState } from "react";

export default function SendReportEmailButtons({
  inspectionId,
  clientEmail,
  realtorEmail,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
}) {
  const [customEmail, setCustomEmail] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  async function sendEmail(type: "client" | "realtor" | "custom") {
    const email =
      type === "client"
        ? clientEmail
        : type === "realtor"
        ? realtorEmail
        : customEmail.trim();

    if (!email) {
      alert("No email address entered.");
      return;
    }

    setSending(type);

    try {
      const shareUrl = `${window.location.origin}/share/${inspectionId}`;

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: type,
          recipientEmail: email,
          shareUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Email failed to send.");
        return;
      }

      alert(data.message || "Report email sent.");
    } catch (error: any) {
      alert(error?.message || "Email failed to send.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => sendEmail("client")}
        disabled={sending !== null || !clientEmail}
        className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending === "client" ? "Sending..." : "Email Client"}
      </button>

      <button
        type="button"
        onClick={() => sendEmail("realtor")}
        disabled={sending !== null || !realtorEmail}
        className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending === "realtor" ? "Sending..." : "Email Realtor"}
      </button>

      <div className="flex flex-wrap gap-2">
        <input
          value={customEmail}
          onChange={(e) => setCustomEmail(e.target.value)}
          placeholder="Send to another email"
          className="min-w-[260px] rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
        />

        <button
          type="button"
          onClick={() => sendEmail("custom")}
          disabled={sending !== null}
          className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending === "custom" ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}