"use client";

import { useState } from "react";

export default function SendSignedAgreementButton({
  inspectionId,
  agreementId,
  clientEmail,
}: {
  inspectionId: string | number;
  agreementId: string;
  clientEmail?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    if (
      !window.confirm(
        `Email a copy of the signed agreement to ${clientEmail || "the client"}?`
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/send-signed-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, agreementId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send.");
      setMsg({ ok: true, text: `Sent to ${data.to}` });
    } catch (error: any) {
      setMsg({ ok: false, text: error?.message || "Failed to send." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="rounded-xl border border-teal-500 bg-teal-500/10 px-4 py-3 text-center text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-slate-950 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email copy to client"}
      </button>
      {msg && (
        <p className={`text-xs font-bold ${msg.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
