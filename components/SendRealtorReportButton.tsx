"use client";

import { useState } from "react";

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
        `Report email is blocked until requirements are complete:\n\n${(
          data.blockers || []
        ).join("\n")}`
      );
    }

    return data;
  }

  async function sendReport() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    if (!realtorEmail) {
      alert("This realtor does not have an email address saved.");
      return;
    }

    const confirmed = window.confirm(`Send this report to ${realtorEmail}?`);

    if (!confirmed) return;

    setSending(true);

    try {
      await checkDeliveryRequirements();

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
        alert(data.error || "Report email failed to send.");
        return;
      }

      alert(data.message || `Report sent to ${realtorEmail}.`);
    } catch (error: any) {
      alert(error?.message || "Report email failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReport}
      disabled={sending || !realtorEmail}
      className="w-full rounded-xl border border-purple-500 px-4 py-2 text-sm font-black text-purple-300 transition hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      title={realtorEmail || "No realtor email saved"}
    >
      {sending ? "Checking..." : `📧 ${label}`}
    </button>
  );
}
