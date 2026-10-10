"use client";

import { useRef, useState } from "react";

// Create a NEW saved agent (realtor) from the realtor currently entered on this
// report's details form — for an agent not already in your agents list. Reads
// the live form inputs (realtor_name/email/phone) so it captures unsaved edits,
// and posts to /api/realtors. Does NOT submit the form (type="button").
export default function SaveAgentButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function save() {
    if (busy) return;
    const form = ref.current?.closest("form");
    const val = (n: string) =>
      String((form?.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value || "").trim();

    const name = val("realtor_name");
    if (!name) {
      setMsg({ type: "error", text: "Enter the realtor's name first." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/realtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: val("realtor_email"),
          phone: val("realtor_phone"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: data?.error || "Could not save the agent." });
        return;
      }
      setMsg({ type: "success", text: `${name} saved to your agents.` });
    } catch (error: any) {
      setMsg({ type: "error", text: error?.message || "Could not save the agent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 print:hidden">
      <button
        ref={ref}
        type="button"
        onClick={save}
        disabled={busy}
        title="Add this realtor to your saved agents for future reports"
        className="inline-flex items-center gap-2 rounded-xl border border-teal-400/60 bg-teal-500/10 px-4 py-2.5 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
      >
        {busy ? "Saving…" : "＋ Save realtor as a new agent"}
      </button>
      {msg && (
        <p className={`mt-2 text-sm font-semibold ${msg.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
