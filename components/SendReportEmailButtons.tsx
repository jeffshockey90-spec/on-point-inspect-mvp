"use client";

import { useEffect, useState } from "react";

export default function SendReportEmailButtons({
  inspectionId,
  clientEmail,
  realtorEmail,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
}) {
  const [customEmail, setCustomEmail] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [contactClientEmail, setContactClientEmail] = useState("");
  const [contactRealtorEmail, setContactRealtorEmail] = useState("");

  useEffect(() => {
    async function loadContacts() {
      if (!inspectionId) return;

      try {
        const res = await fetch(
          `/api/inspection-contacts?inspection_id=${inspectionId}`
        );

        const data = await res.json();

        const contacts = data.contacts || [];

        const client = contacts.find((contact: any) =>
          ["client", "co-client"].includes(
            String(contact.role).toLowerCase()
          )
        );

        const realtor = contacts.find((contact: any) =>
          ["realtor", "agent", "transaction coordinator"].includes(
            String(contact.role).toLowerCase()
          )
        );

        if (client?.email) {
          setContactClientEmail(client.email);
        }

        if (realtor?.email) {
          setContactRealtorEmail(realtor.email);
        }
      } catch (error) {
        console.error("Failed to load report email contacts:", error);
      }
    }

    loadContacts();
  }, [inspectionId]);

  const finalClientEmail = clientEmail || contactClientEmail;
  const finalRealtorEmail = realtorEmail || contactRealtorEmail;

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

  async function sendEmail(type: "client" | "realtor" | "custom") {
    const email =
      type === "client"
        ? finalClientEmail
        : type === "realtor"
          ? finalRealtorEmail
          : customEmail.trim();

    if (!email) {
      alert("No email address entered.");
      return;
    }

    setSending(type);

    try {
      await checkDeliveryRequirements();

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: type,
          recipientEmail: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Email failed to send.");
        return;
      }

      alert(data.message || `Report email sent to ${email}.`);
    } catch (error: any) {
      alert(error?.message || "Email failed to send.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => sendEmail("client")}
        disabled={sending !== null || !finalClientEmail}
        className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending === "client" ? "Checking..." : "Email Client"}
      </button>

      <button
        type="button"
        onClick={() => sendEmail("realtor")}
        disabled={sending !== null || !finalRealtorEmail}
        className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending === "realtor" ? "Checking..." : "Email Realtor"}
      </button>

      <div className="flex flex-wrap gap-2">
        <input
          value={customEmail}
          onChange={(e) => setCustomEmail(e.target.value)}
          placeholder="Send to another email"
          className="min-w-[260px] rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white"
        />

        <button
          type="button"
          onClick={() => sendEmail("custom")}
          disabled={sending !== null}
          className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending === "custom" ? "Checking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
