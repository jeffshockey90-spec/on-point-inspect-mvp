"use client";

import { useState } from "react";

type SendTarget = "client" | "realtor";

export default function SendAgreementButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [sending, setSending] = useState<SendTarget | null>(null);
  // Delivery channel for the client agreement send: email, text, or both.
  const [channel, setChannel] = useState<"both" | "email" | "sms">("both");
  const [clientLabel, setClientLabel] = useState("Send Client Agreement");
  const [realtorLabel, setRealtorLabel] = useState("Send to Realtor to Forward");
  const [showRealtorOption, setShowRealtorOption] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function sendAgreement(target: SendTarget) {
    if (sending) return;

    setMessage(null);

    if (!inspectionId) {
      setMessage({ type: "error", text: "Missing inspection ID." });
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
          // Channel applies to the direct-to-client send; the realtor-forward
          // is always an email.
          channel: target === "client" ? channel : "both",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send agreement.");
      }

      if (target === "client") {
        setClientLabel("Sent!");
        setMessage({
          type: "success",
          text:
            data.message ||
            `Sent ${
              data.sent?.length || 0
            } client agreement email(s). Realtors are not included on this send.`,
        });
      } else {
        setRealtorLabel("Sent!");
        setMessage({
          type: "success",
          text: data.message || "Agreement forwarding email sent to the realtor.",
        });
      }
    } catch (error: any) {
      if (target === "client") setClientLabel("Failed");
      else setRealtorLabel("Failed");
      setMessage({ type: "error", text: error.message || "Failed to send agreement." });
    } finally {
      window.setTimeout(() => {
        setSending(null);
        setClientLabel("Send Client Agreement");
        setRealtorLabel("Send to Realtor to Forward");
      }, 700);
    }
  }

  const channelOptions: Array<{ value: "both" | "email" | "sms"; label: string }> = [
    { value: "email", label: "Email" },
    { value: "sms", label: "Text" },
    { value: "both", label: "Both" },
  ];

  return (
    <div className="flex flex-col items-start gap-2">
      {/* How to deliver the client's agreement: email, text, or both. */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
          Send by
        </span>
        <div className="inline-flex rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-0.5">
          {channelOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setChannel(option.value)}
              disabled={sending !== null}
              aria-pressed={channel === option.value}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition [touch-action:manipulation] disabled:opacity-50 ${
                channel === option.value
                  ? "bg-emerald-500/20 text-[var(--fl-good-text)]"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

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

      {message && (
        <p
          className={`text-sm font-semibold ${
            message.type === "success" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}