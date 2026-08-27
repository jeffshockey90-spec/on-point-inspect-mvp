"use client";

import { useEffect, useState } from "react";

type SendType = "client" | "realtor" | "all" | "custom";
type NoticeType = "success" | "error" | "info";

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
  const [sending, setSending] = useState<SendType | null>(null);
  const [statusLabel, setStatusLabel] = useState("");
  const [contactClientEmail, setContactClientEmail] = useState("");
  const [contactRealtorEmail, setContactRealtorEmail] = useState("");
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);

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
          ["client", "co-client"].includes(String(contact.role).toLowerCase())
        );

        const realtor = contacts.find((contact: any) =>
          ["realtor", "agent", "transaction coordinator"].includes(
            String(contact.role).toLowerCase()
          )
        );

        if (client?.email) setContactClientEmail(client.email);
        if (realtor?.email) setContactRealtorEmail(realtor.email);
      } catch (error) {
        console.error("Failed to load report email contacts:", error);
      }
    }

    loadContacts();
  }, [inspectionId]);

  const finalClientEmail = clientEmail || contactClientEmail;
  const finalRealtorEmail = realtorEmail || contactRealtorEmail;
  const hasAnyKnownRecipient = Boolean(finalClientEmail || finalRealtorEmail);

  function showNotice(type: NoticeType, message: string) {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, type === "error" ? 4500 : 3000);
  }

  async function checkDeliveryRequirements() {
    setStatusLabel("Checking...");

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

  async function sendEmail(type: SendType) {
    if (sending) return;

    const email =
      type === "client"
        ? finalClientEmail
        : type === "realtor"
          ? finalRealtorEmail
          : type === "custom"
            ? customEmail.trim()
            : "";

    if (type !== "all" && !email) {
      showNotice("error", "No email address entered.");
      return;
    }

    if (type === "all" && !hasAnyKnownRecipient) {
      showNotice("error", "No client or realtor email found.");
      return;
    }

    setSending(type);
    setStatusLabel("Starting...");
    setNotice(null);

    try {
      await checkDeliveryRequirements();

      setStatusLabel("Sending...");

      const payload: Record<string, any> = {
        inspectionId,
        recipientType: type,
      };

      if (type !== "all") {
        payload.recipientEmail = email;
      }

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatusLabel("Failed");
        showNotice("error", data.error || "Email failed to send.");
        return;
      }

      setStatusLabel("Sent!");

      if (type === "all") {
        const sentCount = Array.isArray(data.sent) ? data.sent.length : 0;
        const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;

        showNotice(
          failedCount > 0 ? "info" : "success",
          data.message ||
            `Report sent to ${sentCount} recipient${sentCount === 1 ? "" : "s"}${
              failedCount ? `, ${failedCount} failed` : ""
            }.`
        );
      } else {
        showNotice("success", data.message || `Report email sent to ${email}.`);
      }
    } catch (error: any) {
      setStatusLabel("Failed");
      showNotice("error", error?.message || "Email failed to send.");
    } finally {
      window.setTimeout(() => {
        setSending(null);
        setStatusLabel("");
      }, 900);
    }
  }

  function getButtonText(type: SendType, defaultText: string) {
    if (sending !== type) return defaultText;
    return statusLabel || "Working...";
  }

  function Spinner({ active }: { active: boolean }) {
    if (!active) return null;

    return (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="flex w-full max-w-full flex-col gap-3 overflow-hidden sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => sendEmail("client")}
          disabled={sending !== null || !finalClientEmail}
          aria-busy={sending === "client"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-400 sm:w-auto [touch-action:manipulation]"
          title={finalClientEmail || "No client email found"}
        >
          <Spinner active={sending === "client"} />
          {getButtonText("client", "Email Client")}
        </button>

        <button
          type="button"
          onClick={() => sendEmail("realtor")}
          disabled={sending !== null || !finalRealtorEmail}
          aria-busy={sending === "realtor"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500/10 sm:w-auto [touch-action:manipulation]"
          title={finalRealtorEmail || "No realtor email found"}
        >
          <Spinner active={sending === "realtor"} />
          {getButtonText("realtor", "Email Realtor")}
        </button>

        <button
          type="button"
          onClick={() => sendEmail("all")}
          disabled={sending !== null || !hasAnyKnownRecipient}
          aria-busy={sending === "all"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-500/10 px-5 py-3 font-bold text-blue-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-blue-500/20 sm:w-auto [touch-action:manipulation]"
          title={
            hasAnyKnownRecipient
              ? "Send report to client, co-buyer, realtor, agent, and transaction coordinator contacts"
              : "No client or realtor email found"
          }
        >
          <Spinner active={sending === "all"} />
          {getButtonText("all", "Send to All")}
        </button>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            placeholder="Send to another email"
            disabled={sending !== null}
            className="box-border w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-sm sm:flex-1"
          />

          <button
            type="button"
            onClick={() => sendEmail("custom")}
            disabled={sending !== null}
            aria-busy={sending === "custom"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cyan-500/10 sm:w-auto [touch-action:manipulation]"
          >
            <Spinner active={sending === "custom"} />
            {getButtonText("custom", "Send")}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`mt-3 whitespace-pre-line rounded-xl border px-4 py-3 text-sm font-bold ${
            notice.type === "success"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
              : notice.type === "error"
                ? "border-red-500 bg-red-500/10 text-red-200"
                : "border-cyan-500 bg-cyan-500/10 text-cyan-200"
          }`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}
