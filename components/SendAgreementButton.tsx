"use client";

import { useState } from "react";

type SendTarget = "client" | "realtor";

export default function SendAgreementButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [sending, setSending] = useState<SendTarget | null>(null);
  const [clientLabel, setClientLabel] = useState("Send Client Agreement");
  const [realtorLabel, setRealtorLabel] = useState("Send to Realtor to Forward");
  const [showRealtorOption, setShowRealtorOption] = useState(false);

  async function sendAgreement(target: SendTarget) {
    if (sending) return;

    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setSending(target);
    if (target === "client") setClientLabel("Sending...");
    else setRealtorLabel("Sending...");

    try {
      const res = await fetch("/api/send-agreement-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          recipientType: target,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send agreement.");
      }

      if (target === "client") {
        setClientLabel("Sent!");
        alert(
          `Sent ${
            data.sent?.length || 0
          } client agreement email(s). Realtors are not included on this send.`
        );
      } else {
        setRealtorLabel("Sent!");
        alert(data.message || "Agreement forwarding email sent to the realtor.");
      }
    } catch (error: any) {
      if (target === "client") setClientLabel("Failed");
      else setRealtorLabel("Failed");
      alert(error.message || "Failed to send agreement.");
    } finally {
      window.setTimeout(() => {
        setSending(null);
        setClientLabel("Send Client Agreement");
        setRealtorLabel("Send to Realtor to Forward");
      }, 700);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => sendAgreement("client")}
        disabled={sending !== null}
        aria-busy={sending === "client"}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-emerald-500/10 px-5 py-3 font-bold text-[var(--fl-good-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-500 hover:text-slate-950 [touch-action:manipulation]"
      >
        {sending === "client" && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {clientLabel}
      </button>

      {!showRealtorOption ? (
        <button
          type="button"
          onClick={() => setShowRealtorOption(true)}
          className="text-xs font-bold text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
        >
          Realtor asked to forward it themselves?
        </button>
      ) : (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="mb-2 text-xs font-bold text-[var(--fl-warn-text)]">
            Only use this if the realtor specifically asked to receive and forward the
            agreement to the client themselves - this does not replace sending it directly
            to the client.
          </p>
          <button
            type="button"
            onClick={() => sendAgreement("realtor")}
            disabled={sending !== null}
            aria-busy={sending === "realtor"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500 bg-amber-500/10 px-5 py-3 font-bold text-[var(--fl-warn-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500 hover:text-slate-950 [touch-action:manipulation]"
          >
            {sending === "realtor" && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {realtorLabel}
          </button>
        </div>
      )}
    </div>
  );
}