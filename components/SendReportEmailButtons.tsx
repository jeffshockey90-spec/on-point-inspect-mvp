"use client";

import { useEffect, useMemo, useState } from "react";

type SendType = "client" | "realtor" | "all" | "custom" | "selected";
type NoticeType = "success" | "error" | "info";

type Contact = {
  id?: string | number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  portal_access?: boolean | null;
};

// Roles that normally receive the report (used only to pre-check the picker).
const ELIGIBLE_ROLE_RE = /(client|realtor|agent|transaction)/i;

function cleanEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function prettyRole(role: any) {
  const r = String(role || "").trim();
  if (!r) return "Contact";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactClientEmail, setContactClientEmail] = useState("");
  const [contactRealtorEmail, setContactRealtorEmail] = useState("");
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);
  // Recipient picker: which contact emails are ticked, and whether it's open.
  const [showPicker, setShowPicker] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadContacts() {
      if (!inspectionId) return;

      try {
        const res = await fetch(
          `/api/inspection-contacts?inspection_id=${inspectionId}`
        );

        const data = await res.json();
        const loaded: Contact[] = data.contacts || [];
        setContacts(loaded);

        const client = loaded.find((contact: any) =>
          ["client", "co-client"].includes(String(contact.role).toLowerCase())
        );

        const realtor = loaded.find((contact: any) =>
          ["realtor", "agent", "transaction coordinator"].includes(
            String(contact.role).toLowerCase()
          )
        );

        if (client?.email) setContactClientEmail(client.email);
        if (realtor?.email) setContactRealtorEmail(realtor.email);

        // Pre-check the people who'd normally get the report: an eligible role,
        // an email on file, and not explicitly removed from portal access.
        const defaults = new Set<string>();
        loaded.forEach((contact) => {
          const email = cleanEmail(contact.email);
          if (!email) return;
          if (contact.portal_access === false) return;
          if (ELIGIBLE_ROLE_RE.test(String(contact.role || ""))) {
            defaults.add(email);
          }
        });
        setSelectedEmails(defaults);
      } catch (error) {
        console.error("Failed to load report email contacts:", error);
      }
    }

    loadContacts();
  }, [inspectionId]);

  const finalClientEmail = clientEmail || contactClientEmail;
  const finalRealtorEmail = realtorEmail || contactRealtorEmail;
  const hasAnyKnownRecipient = Boolean(finalClientEmail || finalRealtorEmail);

  // Contacts that can actually be emailed (have an address), deduped by email.
  const emailableContacts = useMemo(() => {
    const seen = new Set<string>();
    return contacts.filter((contact) => {
      const email = cleanEmail(contact.email);
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }, [contacts]);

  function showNotice(type: NoticeType, message: string) {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, type === "error" ? 4500 : 3000);
  }

  function toggleEmail(email: string) {
    const key = cleanEmail(email);
    if (!key) return;
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedEmails(
      new Set(emailableContacts.map((contact) => cleanEmail(contact.email)))
    );
  }

  function clearAll() {
    setSelectedEmails(new Set());
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

    const pickedEmails =
      type === "selected" ? Array.from(selectedEmails) : [];

    if (type === "selected" && !pickedEmails.length) {
      showNotice("error", "Pick at least one recipient.");
      return;
    }

    if (type !== "all" && type !== "selected" && !email) {
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

      if (type === "custom") {
        payload.recipientEmail = email;
      } else if (type === "selected") {
        payload.recipientEmails = pickedEmails;
      } else if (type === "client" || type === "realtor") {
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

      if (type === "all" || type === "selected") {
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-purple-500/10 sm:w-auto [touch-action:manipulation]"
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-500/10 px-5 py-3 font-bold text-[var(--fl-info-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-blue-500/20 sm:w-auto [touch-action:manipulation]"
          title={
            hasAnyKnownRecipient
              ? "Send report to client, co-buyer, realtor, agent, and transaction coordinator contacts"
              : "No client or realtor email found"
          }
        >
          <Spinner active={sending === "all"} />
          {getButtonText("all", "Send to All")}
        </button>

        <button
          type="button"
          onClick={() => setShowPicker((open) => !open)}
          disabled={sending !== null || emailableContacts.length === 0}
          aria-expanded={showPicker}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--fl-ground)] sm:w-auto [touch-action:manipulation]"
          title={
            emailableContacts.length
              ? "Choose exactly who gets the report"
              : "No contacts with an email on file"
          }
        >
          Choose recipients
          <span
            className={`text-xs transition-transform ${showPicker ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-5 py-3 font-bold text-[var(--fl-info-text)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cyan-500/10 sm:w-auto [touch-action:manipulation]"
          >
            <Spinner active={sending === "custom"} />
            {getButtonText("custom", "Send")}
          </button>
        </div>
      </div>

      {showPicker && (
        <div className="mt-3 w-full max-w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[var(--fl-text)]">
              Pick who gets the report
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={sending !== null}
                className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={sending !== null}
                className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-faint)] transition hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {emailableContacts.map((contact) => {
              const email = cleanEmail(contact.email);
              const checked = selectedEmails.has(email);
              return (
                <label
                  key={email}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-raised)] px-4 py-3 transition hover:border-[var(--fl-faint)] [touch-action:manipulation]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmail(email)}
                    disabled={sending !== null}
                    className="mt-1 h-4 w-4 accent-teal-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--fl-text)]">
                        {contact.name || contact.email}
                      </span>
                      <span className="rounded-full border border-[var(--fl-line)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                        {prettyRole(contact.role)}
                      </span>
                      {contact.portal_access === false && (
                        <span className="rounded-full border border-amber-500/60 px-2 py-0.5 text-[11px] font-semibold text-[var(--fl-warn-text)]">
                          Portal off
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-sm text-[var(--fl-faint)]">
                      {contact.email}
                      {contact.phone ? ` · ${contact.phone}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => sendEmail("selected")}
            disabled={sending !== null || selectedEmails.size === 0}
            aria-busy={sending === "selected"}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-400 [touch-action:manipulation]"
          >
            <Spinner active={sending === "selected"} />
            {getButtonText(
              "selected",
              `Send to ${selectedEmails.size} selected`
            )}
          </button>
        </div>
      )}

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
