"use client";

import { useState } from "react";

type Props = {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
};

type MessageType = "success" | "error" | "warning" | "";

export default function SendFullReportButton({
  inspectionId,
  clientEmail,
  realtorEmail,
}: Props) {
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Send Report");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessageType("");
    setMessage("");
  }

  async function checkDeliveryRequirements() {
    setStatusText("Checking Requirements...");

    const res = await fetch(
      `/api/report-delivery-status?inspection_id=${inspectionId}`
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not check delivery requirements.");
    }

    if (!data.canDeliver) {
      throw new Error(
        `Report delivery is blocked until requirements are complete:\n\n${(
          data.blockers || []
        ).join("\n")}`
      );
    }

    return data;
  }

  async function loadContactEmails() {
    setStatusText("Loading Contacts...");

    let finalClientEmail = clientEmail || "";
    let finalRealtorEmail = realtorEmail || "";

    try {
      const res = await fetch(
        `/api/inspection-contacts?inspection_id=${inspectionId}`
      );

      const data = await res.json();
      const contacts = data.contacts || [];

      if (!finalClientEmail) {
        const client = contacts.find((contact: any) =>
          ["client", "co-client"].includes(String(contact.role).toLowerCase())
        );

        finalClientEmail = client?.email || "";
      }

      if (!finalRealtorEmail) {
        const realtor = contacts.find((contact: any) =>
          ["realtor", "agent", "transaction coordinator"].includes(
            String(contact.role).toLowerCase()
          )
        );

        finalRealtorEmail = realtor?.email || "";
      }
    } catch (error) {
      console.error("Could not load contacts for report delivery:", error);
    }

    return {
      finalClientEmail,
      finalRealtorEmail,
    };
  }

  async function sendToRecipient(
    recipientType: "client" | "realtor",
    recipientEmail: string
  ) {
    setStatusText(
      recipientType === "client" ? "Sending Client..." : "Sending Realtor..."
    );

    const res = await fetch("/api/send-report-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionId,
        recipientType,
        recipientEmail,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error || `Failed to send report to ${recipientType}.`
      );
    }

    return data;
  }

  async function sendReport() {
    if (sending) return;

    clearMessage();

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    setSending(true);
    setStatusText("Starting...");

    try {
      await checkDeliveryRequirements();

      const { finalClientEmail, finalRealtorEmail } =
        await loadContactEmails();

      if (!finalClientEmail && !finalRealtorEmail) {
        setStatusText("No Email Found");
        showMessage("warning", "No client or realtor email found.");
        return;
      }

      const sentTo: string[] = [];
      const failed: string[] = [];

      if (finalClientEmail) {
        try {
          await sendToRecipient("client", finalClientEmail);
          sentTo.push(`client: ${finalClientEmail}`);
        } catch (error: any) {
          failed.push(`client: ${error.message}`);
        }
      }

      if (finalRealtorEmail) {
        try {
          await sendToRecipient("realtor", finalRealtorEmail);
          sentTo.push(`realtor: ${finalRealtorEmail}`);
        } catch (error: any) {
          failed.push(`realtor: ${error.message}`);
        }
      }

      if (failed.length > 0) {
        setStatusText("Completed With Errors");
        showMessage(
          "error",
          `Report delivery completed with errors. Sent: ${
            sentTo.length ? sentTo.join(", ") : "None"
          }. Failed: ${failed.join(", ")}`
        );
        return;
      }

      setStatusText("Sent!");
      showMessage("success", `Report sent successfully to ${sentTo.join(", ")}.`);
    } catch (error: any) {
      setStatusText("Failed");
      showMessage("error", error?.message || "Failed to send report.");
    } finally {
      window.setTimeout(() => {
        setSending(false);
        setStatusText("Send Report");
      }, 900);
    }
  }

  return (
    <div className="w-full max-w-full space-y-2 sm:w-auto">
      <button
        type="button"
        onClick={sendReport}
        disabled={sending}
        aria-busy={sending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 hover:bg-purple-500/10 sm:w-auto [touch-action:manipulation]"
      >
        {sending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {statusText}
      </button>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            messageType === "success"
              ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
              : messageType === "warning"
                ? "border-yellow-500 bg-yellow-950/30 text-yellow-300"
                : "border-red-500 bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
