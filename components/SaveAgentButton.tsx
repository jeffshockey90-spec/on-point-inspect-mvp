"use client";

import { useRef, useState } from "react";
import { toPhoneDigits } from "../lib/phone";

// Save the realtor ALREADY ON THIS REPORT into your saved agents, in one tap —
// name, email and phone come straight from the inspection (passed as props), so
// there's nothing to re-type. If the inspector edited the realtor fields in the
// form above without saving yet, those live values win over the props. Dedupes
// server-side, so a repeat tap (or an agent you already have) is a no-op.
export default function SaveAgentButton({
  name: nameProp = "",
  email: emailProp = "",
  phone: phoneProp = "",
}: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function save() {
    if (busy) return;

    // Prefer a live edit in the form (if that field exists and was changed),
    // otherwise use the value already on the report.
    const form = ref.current?.closest("form");
    const live = (n: string) => {
      const el = form?.querySelector(`[name="${n}"]`) as HTMLInputElement | null;
      return el ? String(el.value || "").trim() : "";
    };

    const name = live("realtor_name") || String(nameProp || "").trim();
    const email = live("realtor_email") || String(emailProp || "").trim();
    const phone = live("realtor_phone") || String(phoneProp || "").trim();

    if (!name) {
      setMsg({
        type: "error",
        text: "This report has no realtor entered yet — add one above first.",
      });
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
          email,
          // Store only the digits (matches how numbers are saved elsewhere).
          phone: phone ? toPhoneDigits(phone) : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: data?.error || "Could not save the agent." });
        return;
      }
      setMsg({
        type: "success",
        text: data?.deduped
          ? `${name} is already in your agents.`
          : `Saved ${name}${email ? ` (${email})` : ""} to your agents.`,
      });
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
        title="Save this report's realtor to your saved agents for future reports"
        className="inline-flex items-center gap-2 rounded-xl border border-teal-400/60 bg-teal-500/10 px-4 py-2.5 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
      >
        {busy ? "Saving…" : "＋ Save this realtor to my contacts"}
      </button>
      {msg && (
        <p className={`mt-2 text-sm font-semibold ${msg.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
