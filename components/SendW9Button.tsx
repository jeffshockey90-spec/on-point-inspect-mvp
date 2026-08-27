"use client";

import { useEffect, useState } from "react";

type SendType = "client" | "realtor" | "custom";
type NoticeType = "success" | "error" | "info";

export default function SendW9Button({ inspectionId }: { inspectionId: string }) {
  const [customEmail, setCustomEmail] = useState("");
  const [sending, setSending] = useState<SendType | null>(null);
  const [contactClientEmail, setContactClientEmail] = useState("");
  const [contactRealtorEmail, setContactRealtorEmail] = useState("");
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);

  useEffect(() => {
    async function loadContacts() {
      if (!inspectionId) return;

      try {
        const res = await fetch(`/api/inspection-contacts?inspection_id=${inspectionId}`);
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
        console.error("Failed to load W9 recipient contacts:", error);
      }
    }

    loadContacts();
  }, [inspectionId]);

  function showNotice(type: NoticeType, message: string) {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, type === "error" ? 4500 : 3000);
  }

  async function sendW9(type: SendType) {
    if (sending) return;

    const email =
      type === "client"
        ? contactClientEmail
        : type === "realtor"
          ? contactRealtorEmail
          : customEmail.trim();

    if (!email) {
      showNotice("error", "No email address entered.");
      return;
    }

    setSending(type);
    setNotice(null);

    try {
      const res = await fetch("/api/send-w9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, recipientEmail: email }),
      });

      const data = await res.json();

      if (!res.ok) {
        showNotice("error", data.error || "Failed to send W9.");
        return;
      }

      showNotice("success", data.message || `W9 sent to ${email}.`);
      if (type === "custom") setCustomEmail("");
    } catch (error: any) {
      showNotice("error", error?.message || "Failed to send W9.");
    } finally {
      window.setTimeout(() => setSending(null), 700);
    }
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
          onClick={() => sendW9("client")}
          disabled={sending !== null || !contactClientEmail}
          aria-busy={sending === "client"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500 bg-amber-500/10 px-5 py-3 font-bold text-[var(--fl-warn-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-500/20 sm:w-auto [touch-action:manipulation]"
          title={contactClientEmail || "No client email found"}
        >
          <Spinner active={sending === "client"} />
          {sending === "client" ? "Sending..." : "Email W9 to Client"}
        </button>

        <button
          type="button"
          onClick={() => sendW9("realtor")}
          disabled={sending !== null || !contactRealtorEmail}
          aria-busy={sending === "realtor"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500/10 sm:w-auto [touch-action:manipulation]"
          title={contactRealtorEmail || "No realtor email found"}
        >
          <Spinner active={sending === "realtor"} />
          {sending === "realtor" ? "Sending..." : "Email W9 to Realtor"}
        </button>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            placeholder="Send W9 to another email"
            disabled={sending !== null}
            className="box-border w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-sm sm:flex-1"
          />

          <button
            type="button"
            onClick={() => sendW9("custom")}
            disabled={sending !== null}
            aria-busy={sending === "custom"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-5 py-3 font-bold text-[var(--fl-info-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cyan-500/10 sm:w-auto [touch-action:manipulation]"
          >
            <Spinner active={sending === "custom"} />
            {sending === "custom" ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`mt-3 whitespace-pre-line rounded-xl border px-4 py-3 text-sm font-bold ${
            notice.type === "success"
              ? "border-emerald-500 bg-emerald-500/10 text-[var(--fl-good-text)]"
              : notice.type === "error"
                ? "border-red-500 bg-red-500/10 text-[var(--fl-crit-text)]"
                : "border-cyan-500 bg-cyan-500/10 text-[var(--fl-info-text)]"
          }`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}
