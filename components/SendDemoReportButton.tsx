"use client";

import { useState } from "react";

export default function SendDemoReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function send() {
    if (sending) return;
    if (!email.trim()) {
      setError("Enter the recipient's email.");
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/send-demo-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          recipientEmail: email,
          recipientName: name,
          message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to send the demo report.");
      setNotice(`Sent to ${json.recipient}.`);
      setEmail("");
      setName("");
      setMessage("");
    } catch (e: any) {
      setError(e?.message || "Failed to send the demo report.");
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "w-full min-w-0 rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-400";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-fuchsia-500 px-5 py-3 font-bold text-fuchsia-300 transition hover:bg-fuchsia-500/10"
      >
        📤 Send Demo Report
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-fuchsia-500/40 bg-fuchsia-950/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black uppercase tracking-wide text-fuchsia-300">Send Demo Report</p>
        <button type="button" onClick={() => setOpen(false)} className="text-lg text-slate-400 hover:text-white" aria-label="Close">
          ×
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-200">{error}</div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200">{notice}</div>
      )}

      <div className="space-y-2">
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Realtor / prospect email *" />
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name (optional)" />
        <textarea className={`${inputClass} min-h-[70px]`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional personal note (leave blank for a default intro)" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-fuchsia-400 disabled:cursor-wait disabled:opacity-70"
        >
          {sending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Sending…
            </>
          ) : (
            "Send"
          )}
        </button>
        <span className="text-xs text-slate-400">Emails a "View Sample Report" link + your profile.</span>
      </div>
    </div>
  );
}
