"use client";

import { useState } from "react";

type Props = {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
};

export default function SendFullReportButton({
  inspectionId,
  clientEmail,
  realtorEmail,
}: Props) {
  const [sending, setSending] = useState(false);

  async function checkDeliveryRequirements() {
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
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setSending(true);

    try {
      await checkDeliveryRequirements();

      const { finalClientEmail, finalRealtorEmail } =
        await loadContactEmails();

      if (!finalClientEmail && !finalRealtorEmail) {
        alert("No client or realtor email found.");
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
        alert(
          `Report delivery completed with errors.\n\nSent:\n${
            sentTo.length ? sentTo.join("\n") : "None"
          }\n\nFailed:\n${failed.join("\n")}`
        );
        return;
      }

      alert(`Report sent successfully to:\n${sentTo.join("\n")}`);
    } catch (error: any) {
      alert(error?.message || "Failed to send report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReport}
      disabled={sending}
      className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {sending ? "Checking Requirements..." : "Send Report"}
    </button>
  );
}
