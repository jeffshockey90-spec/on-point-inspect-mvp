"use client";

import { useState } from "react";

export default function ResendConfirmationButton({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const [target, setTarget] = useState<"all" | "realtor" | "client">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: any = { inspectionId };
      if (target === "realtor") body.recipientRole = "realtor";
      if (target === "client") body.recipientRole = "client";

      const res = await fetch("/api/send-schedule-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to resend.");

      const sentList = Array.isArray(data.sent) ? data.sent : [];
      if (data.skipped || sentList.length === 0) {
        setMsg({
          ok: false,
          text:
            target === "realtor"
              ? "No realtor with an email on this inspection."
              : "No recipient with an email found.",
        });
      } else {
        const to = sentList
          .map((s: any) => s.email || s.recipient || s.to)
          .filter(Boolean)
          .join(", ");
        setMsg({ ok: true, text: `Confirmation resent${to ? ` to ${to}` : ""}.` });
      }
    } catch (error: any) {
      setMsg({ ok: false, text: error?.message || "Failed to resend." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <p className="text-sm font-semibold text-[var(--fl-text)]">Resend Schedule Confirmation</p>
      <p className="mt-1 text-xs text-[var(--fl-muted)]">
        Re-sends the &ldquo;Inspection Confirmed&rdquo; email — handy if a copy was delayed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as any)}
          disabled={busy}
          className="min-h-[44px] rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:opacity-50"
        >
          <option value="all">Everyone (client + realtor)</option>
          <option value="realtor">Realtor only</option>
          <option value="client">Client only</option>
        </select>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="min-h-[44px] rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
        >
          {busy ? "Resending…" : "Resend"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-bold ${msg.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
