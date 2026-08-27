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
    "w-full min-w-0 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-fuchsia-400";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-fuchsia-500 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition hover:bg-fuchsia-500/10"
      >
        📤 Send Demo Report
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-purple-text)]">Send Demo Report</p>
        <button type="button" onClick={() => setOpen(false)} className="text-lg text-[var(--fl-muted)] hover:text-[var(--fl-text)]" aria-label="Close">
          ×
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-700 bg-red-500/10 px-3 py-2 text-xs font-bold text-[var(--fl-crit-text)]">{error}</div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-700 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-[var(--fl-good-text)]">{notice}</div>
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
          className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-400 disabled:cursor-wait disabled:opacity-70"
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
        <span className="text-xs text-[var(--fl-muted)]">Emails a "View Sample Report" link + your profile.</span>
      </div>
    </div>
  );
}
