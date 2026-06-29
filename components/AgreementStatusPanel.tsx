"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "yellow" | "teal" | "slate";
}) {
  const classes =
    tone === "green"
      ? "border-green-500/40 bg-green-500/10 text-green-300"
      : tone === "yellow"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
        : tone === "teal"
          ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
          : "border-slate-600 bg-slate-800/60 text-slate-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${classes}`}
    >
      {children}
    </span>
  );
}

type SignedAgreementSummary = {
  id: string | number;
  contact_id?: string | number | null;
  client_name?: string | null;
  client_email?: string | null;
  signed_at?: string | null;
};

function normalizeEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function formatSignedDate(value: any) {
  if (!value) return "Signed";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Signed";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AgreementStatusPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [signedAgreements, setSignedAgreements] = useState<SignedAgreementSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  async function loadContacts() {
    if (!inspectionId) return;

    setLoading(true);

    try {
      const [contactsRes, agreementsRes] = await Promise.all([
        fetch(`/api/inspection-contacts?inspection_id=${inspectionId}`),
        fetch(`/api/signed-agreements?inspection_id=${inspectionId}`),
      ]);

      const contactsData = await contactsRes.json().catch(() => ({}));
      const agreementsData = await agreementsRes.json().catch(() => ({}));

      setContacts(contactsData.contacts || []);
      setSignedAgreements(agreementsData.agreements || []);
    } finally {
      setLoading(false);
    }
  }

  const requiredContacts = useMemo(
    () => contacts.filter((contact) => Boolean(contact.agreement_required)),
    [contacts]
  );

  const unsignedRequiredContacts = useMemo(
    () => requiredContacts.filter((contact) => !contact.agreement_signed),
    [requiredContacts]
  );

  const allRequiredSigned =
    requiredContacts.length > 0 && unsignedRequiredContacts.length === 0;

  const agreementsByContactId = useMemo(() => {
    const map: Record<string, SignedAgreementSummary> = {};

    for (const agreement of signedAgreements) {
      const contactId = String(agreement.contact_id || "");
      if (contactId && !map[contactId]) map[contactId] = agreement;
    }

    return map;
  }, [signedAgreements]);

  const agreementsByEmail = useMemo(() => {
    const map: Record<string, SignedAgreementSummary> = {};

    for (const agreement of signedAgreements) {
      const email = normalizeEmail(agreement.client_email);
      if (email && !map[email]) map[email] = agreement;
    }

    return map;
  }, [signedAgreements]);

  function getAgreementForContact(contact: any) {
    const byContact = agreementsByContactId[String(contact?.id || "")];
    if (byContact) return byContact;

    const byEmail = agreementsByEmail[normalizeEmail(contact?.email)];
    if (byEmail) return byEmail;

    return null;
  }

  async function sendReminder(contactId?: string) {
    setSendingReminder(contactId || "all");

    try {
      const res = await fetch("/api/send-agreement-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, contactId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminder.");

      alert(`Sent ${data.sent?.length || 0} reminder email(s).`);
      await loadContacts();
    } catch (error: any) {
      alert(error.message || "Failed to send reminder.");
    } finally {
      setSendingReminder(null);
    }
  }

  return (
    <section className="mb-6 w-full max-w-full overflow-hidden rounded-3xl border border-slate-700 bg-[#071224] shadow-2xl shadow-black/20">
      <div className="border-b border-slate-800 bg-gradient-to-r from-[#0f172a] via-[#0b1628] to-[#071224] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-400">
              Agreement Status
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Signature Tracking
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {loading ? (
                <Badge tone="slate">Loading</Badge>
              ) : requiredContacts.length === 0 ? (
                <Badge tone="yellow">No Required Signers</Badge>
              ) : allRequiredSigned ? (
                <Badge tone="green">All Signed</Badge>
              ) : (
                <Badge tone="yellow">{unsignedRequiredContacts.length} Remaining</Badge>
              )}
              <Badge tone="teal">{requiredContacts.length} Required</Badge>
            </div>
          </div>

          {requiredContacts.length > 0 && !allRequiredSigned && (
            <button
              type="button"
              onClick={() => sendReminder()}
              disabled={sendingReminder !== null}
              className="w-full rounded-2xl border border-yellow-500/70 bg-yellow-500/10 px-5 py-3 text-sm font-black text-yellow-300 transition hover:bg-yellow-500 hover:text-slate-950 disabled:opacity-50 sm:w-auto"
            >
              {sendingReminder === "all" ? "Sending..." : "Remind All"}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading && (
          <p className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4 text-sm text-slate-400">
            Loading agreement status...
          </p>
        )}

        {!loading && requiredContacts.length === 0 && (
          <div className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4 text-sm leading-6 text-slate-400">
            No required agreement signers added yet. Add clients in the Client / Realtor Contacts section and mark Agreement Required.
          </div>
        )}

        {!loading && requiredContacts.length > 0 && (
          <div className="space-y-3">
            {requiredContacts.map((contact) => {
              const signed = Boolean(contact.agreement_signed);
              const signedAgreement = getAgreementForContact(contact);

              return (
                <article
                  key={contact.id}
                  className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-black text-white">
                          {contact.name}
                        </p>
                        <Badge tone="teal">{contact.role || "client"}</Badge>
                        <Badge tone={signed ? "green" : "yellow"}>
                          {signed ? "Signed" : "Unsigned"}
                        </Badge>
                        <Badge tone="slate">Required</Badge>
                      </div>

                      <p className="mt-2 break-all text-sm text-slate-400">
                        {contact.email}
                      </p>

                      {signedAgreement?.signed_at && (
                        <p className="mt-2 text-xs font-bold text-green-300">
                          Signed: {formatSignedDate(signedAgreement.signed_at)}
                        </p>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[190px]">
                      {signed && signedAgreement?.id && (
                        <Link
                          href={`/reports/${inspectionId}/signed-agreement/${signedAgreement.id}`}
                          className="w-full rounded-xl border border-green-500/70 bg-green-500/10 px-4 py-2 text-center text-sm font-black text-green-300 transition hover:bg-green-500 hover:text-slate-950"
                        >
                          View Signed Agreement
                        </Link>
                      )}

                      {!signed && (
                        <button
                          type="button"
                          onClick={() => sendReminder(contact.id)}
                          disabled={sendingReminder !== null}
                          className="w-full rounded-xl border border-yellow-500/70 px-4 py-2 text-sm font-black text-yellow-300 transition hover:bg-yellow-500/10 disabled:opacity-50"
                        >
                          {sendingReminder === contact.id ? "Sending..." : "Send Reminder"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
