"use client";

import { useState } from "react";

type MessageType = "success" | "error" | "";

export default function SendRealtorReportButton({
  inspectionId,
  realtorEmail,
  label = "Send Report",
}: {
  inspectionId: string;
  realtorEmail?: string | null;
  label?: string;
}) {
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState(label);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function checkDeliveryRequirements() {
    setStatusText("Checking...");

    const res = await fetch(
      `/api/report-delivery-status?inspection_id=${inspectionId}`
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not check delivery requirements.");
    }

    if (!data.canDeliver) {
      throw new Error(
        `Report email is blocked until requirements are complete:\n\n${(
          data.blockers || []
        ).join("\n")}`
      );
    }

    return data;
  }

  async function sendReport() {
    if (sending) return;

    setMessage("");
    setMessageType("");

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    if (!realtorEmail) {
      showMessage("error", "This realtor does not have an email address saved.");
      return;
    }

    const confirmed = window.confirm(`Send this report to ${realtorEmail}?`);

    if (!confirmed) return;

    setSending(true);
    setStatusText("Starting...");

    try {
      await checkDeliveryRequirements();

      setStatusText("Sending...");

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: "realtor",
          recipientEmail: realtorEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Report email failed to send.");
      }

      setStatusText("Sent!");
      showMessage("success", data.message || `Report sent to ${realtorEmail}.`);
    } catch (error: any) {
      setStatusText("Failed");
      showMessage("error", error?.message || "Report email failed to send.");
    } finally {
      window.setTimeout(() => {
        setSending(false);
        setStatusText(label);
      }, 900);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={sendReport}
        disabled={sending || !realtorEmail}
        aria-busy={sending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 px-4 py-2 text-sm font-black text-purple-300 transition active:scale-[0.98] hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto [touch-action:manipulation]"
        title={realtorEmail || "No realtor email saved"}
      >
        {sending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {sending ? statusText : `📧 ${statusText}`}
      </button>

      {message && (
        <p
          className={`mt-2 max-w-sm rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
            messageType === "success"
              ? "border-emerald-500/60 bg-emerald-950/30 text-emerald-300"
              : "border-red-500/60 bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
