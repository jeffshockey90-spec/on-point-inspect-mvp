"use client";

import { useState } from "react";

export default function AgreementStatusResend({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function resend() {
    if (state === "sending") return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch("/api/send-agreement-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Send failed.");
      setState("sent");
      setMsg("Sent ✓");
    } catch (error: any) {
      setState("error");
      setMsg(error?.message || "Failed");
    }
  }

  return (
    <button
      type="button"
      onClick={resend}
      disabled={state === "sending"}
      title={state === "error" ? msg : undefined}
      className="rounded-lg border border-teal-500/60 px-3 py-1.5 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {state === "sending"
        ? "Sending…"
        : state === "sent"
          ? "Sent ✓"
          : state === "error"
            ? "Retry"
            : "Send / Resend"}
    </button>
  );
}
