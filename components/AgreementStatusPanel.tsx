"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "yellow" | "teal" | "slate" | "purple";
}) {
  const classes =
    tone === "green"
      ? "border-green-500/40 bg-green-500/10 text-green-300"
      : tone === "yellow"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
        : tone === "teal"
          ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
          : tone === "purple"
            ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
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

type WaiverState = {
  agreement_waived: boolean;
  agreement_waived_at?: string | null;
  agreement_waived_by?: string | null;
  agreement_waived_by_name?: string | null;
  agreement_waiver_reason?: string | null;
};

function normalizeEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

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
  const [signedAgreements, setSignedAgreements] = useState<
    SignedAgreementSummary[]
  >([]);
  const [waiver, setWaiver] = useState<WaiverState>({
    agreement_waived: false,
  });
  const [loading, setLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [waiverBusy, setWaiverBusy] = useState(false);
  const [showWaiverForm, setShowWaiverForm] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  async function loadContacts() {
    if (!inspectionId) return;

    setLoading(true);
    setMessage("");

    try {
      const [contactsRes, agreementsRes, waiverRes] = await Promise.all([
        fetch(`/api/inspection-contacts?inspection_id=${inspectionId}`, {
          cache: "no-store",
        }),
        fetch(`/api/signed-agreements?inspection_id=${inspectionId}`, {
          cache: "no-store",
        }),
        fetch(`/api/agreement-waiver?inspection_id=${inspectionId}`, {
          cache: "no-store",
        }),
      ]);

      const contactsData = await contactsRes.json().catch(() => ({}));
      const agreementsData = await agreementsRes.json().catch(() => ({}));
      const waiverData = await waiverRes.json().catch(() => ({}));

      setContacts(contactsData.contacts || []);
      setSignedAgreements(agreementsData.agreements || []);

      if (waiverRes.ok) {
        setWaiver({
          agreement_waived: Boolean(waiverData.agreement_waived),
          agreement_waived_at: waiverData.agreement_waived_at || null,
          agreement_waived_by: waiverData.agreement_waived_by || null,
          agreement_waived_by_name:
            waiverData.agreement_waived_by_name || null,
          agreement_waiver_reason:
            waiverData.agreement_waiver_reason || null,
        });
      }
    } catch (error: any) {
      setMessage(error?.message || "Failed to load agreement status.");
    } finally {
      setLoading(false);
    }
  }

  const requiredContacts = useMemo(
    () => contacts.filter((contact) => Boolean(contact.agreement_required)),
    [contacts],
  );

  const unsignedRequiredContacts = useMemo(
    () =>
      requiredContacts.filter(
        (contact) => !Boolean(contact.agreement_signed),
      ),
    [requiredContacts],
  );

  const allRequiredSigned =
    requiredContacts.length > 0 && unsignedRequiredContacts.length === 0;

  const agreementRequirementComplete =
    allRequiredSigned || waiver.agreement_waived;

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
    return byEmail || null;
  }

  async function sendReminder(contactId?: string) {
    if (waiver.agreement_waived) return;

    setSendingReminder(contactId || "all");

    try {
      const res = await fetch("/api/send-agreement-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, contactId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send reminder.");

      alert(`Sent ${data.sent?.length || 0} reminder email(s).`);
      await loadContacts();
    } catch (error: any) {
      alert(error.message || "Failed to send reminder.");
    } finally {
      setSendingReminder(null);
    }
  }

  async function waiveAgreement() {
    const reason = waiverReason.trim();

    if (!reason) {
      setMessage("Enter a reason before waiving the agreement requirement.");
      return;
    }

    if (
      !window.confirm(
        "Waive the agreement requirement for this inspection? This will be recorded in the audit trail.",
      )
    ) {
      return;
    }

    setWaiverBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/agreement-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          action: "waive",
          reason,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to waive agreement.");
      }

      setWaiverReason("");
      setShowWaiverForm(false);
      setMessage("Agreement requirement waived.");
      await loadContacts();

      window.dispatchEvent(
        new CustomEvent("opi:agreement-waiver-changed", {
          detail: { inspectionId, waived: true },
        }),
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to waive agreement.");
    } finally {
      setWaiverBusy(false);
    }
  }

  async function removeWaiver() {
    if (
      !window.confirm(
        "Remove this waiver? Required unsigned contacts will become pending again.",
      )
    ) {
      return;
    }

    setWaiverBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/agreement-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          action: "remove",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove waiver.");
      }

      setMessage("Agreement waiver removed.");
      await loadContacts();

      window.dispatchEvent(
        new CustomEvent("opi:agreement-waiver-changed", {
          detail: { inspectionId, waived: false },
        }),
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to remove waiver.");
    } finally {
      setWaiverBusy(false);
    }
  }

  return (
    <section
      id="agreement-status"
      className="mb-6 w-full max-w-full overflow-hidden rounded-3xl border border-slate-700 bg-[#071224] shadow-2xl shadow-black/20"
    >
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
              ) : waiver.agreement_waived ? (
                <Badge tone="purple">Agreement Waived</Badge>
              ) : requiredContacts.length === 0 ? (
                <Badge tone="yellow">No Required Signers</Badge>
              ) : allRequiredSigned ? (
                <Badge tone="green">All Signed</Badge>
              ) : (
                <Badge tone="yellow">
                  {unsignedRequiredContacts.length} Remaining
                </Badge>
              )}

              <Badge tone="teal">{requiredContacts.length} Required</Badge>

              {agreementRequirementComplete && (
                <Badge tone="green">Requirement Complete</Badge>
              )}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto">
            {!waiver.agreement_waived &&
              requiredContacts.length > 0 &&
              !allRequiredSigned && (
                <button
                  type="button"
                  onClick={() => sendReminder()}
                  disabled={sendingReminder !== null || waiverBusy}
                  className="w-full rounded-2xl border border-yellow-500/70 bg-yellow-500/10 px-5 py-3 text-sm font-black text-yellow-300 transition hover:bg-yellow-500 hover:text-slate-950 disabled:opacity-50 sm:w-auto"
                >
                  {sendingReminder === "all" ? "Sending..." : "Remind All"}
                </button>
              )}

            {!waiver.agreement_waived && (
              <button
                type="button"
                onClick={() => setShowWaiverForm((value) => !value)}
                disabled={waiverBusy}
                className="w-full rounded-2xl border border-purple-500/70 bg-purple-500/10 px-5 py-3 text-sm font-black text-purple-300 transition hover:bg-purple-500 hover:text-white disabled:opacity-50 sm:w-auto"
              >
                Waive Agreement Requirement
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {message && (
          <div className="mb-4 rounded-2xl border border-slate-600 bg-slate-900/70 p-4 text-sm font-bold text-slate-200">
            {message}
          </div>
        )}

        {waiver.agreement_waived && (
          <div className="mb-4 rounded-2xl border border-purple-500/60 bg-purple-500/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                  Agreement Requirement Waived
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-200">
                  <strong>Reason:</strong>{" "}
                  {waiver.agreement_waiver_reason || "No reason recorded"}
                </p>

                <p className="mt-2 text-xs text-slate-400">
                  Waived by{" "}
                  {waiver.agreement_waived_by_name ||
                    waiver.agreement_waived_by ||
                    "Inspector"}{" "}
                  on {formatDate(waiver.agreement_waived_at)}.
                </p>
              </div>

              <button
                type="button"
                onClick={removeWaiver}
                disabled={waiverBusy}
                className="rounded-xl border border-red-500/70 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
              >
                {waiverBusy ? "Working..." : "Remove Waiver"}
              </button>
            </div>
          </div>
        )}

        {showWaiverForm && !waiver.agreement_waived && (
          <div className="mb-4 rounded-2xl border border-purple-500/50 bg-purple-500/10 p-4">
            <h3 className="text-lg font-black text-purple-300">
              Waive Agreement Requirement
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              This does not mark an agreement as signed. It records that the
              inspection company intentionally waived the signature requirement.
            </p>

            <textarea
              value={waiverReason}
              onChange={(event) => setWaiverReason(event.target.value)}
              disabled={waiverBusy}
              placeholder="Required reason, example: Existing signed paper agreement retained in company records."
              className="mt-4 min-h-[110px] w-full rounded-xl border border-purple-500/40 bg-slate-950 px-4 py-3 text-white outline-none focus:border-purple-300 disabled:opacity-60"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Existing signed paper agreement on file",
                "Duplicate inspection record",
                "Company-authorized exception",
                "Other documented exception",
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setWaiverReason(reason)}
                  disabled={waiverBusy}
                  className="rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/20 disabled:opacity-50"
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={waiveAgreement}
                disabled={waiverBusy || !waiverReason.trim()}
                className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-black text-white hover:bg-purple-400 disabled:opacity-50"
              >
                {waiverBusy ? "Saving..." : "Confirm Waiver"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowWaiverForm(false);
                  setWaiverReason("");
                  setMessage("");
                }}
                disabled={waiverBusy}
                className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-black text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && (
          <p className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4 text-sm text-slate-400">
            Loading agreement status...
          </p>
        )}

        {!loading && requiredContacts.length === 0 && (
          <div className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4 text-sm leading-6 text-slate-400">
            No required agreement signers added yet. Add clients in the Client /
            Realtor Contacts section and mark Agreement Required.
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

                        <Badge tone="teal">
                          {contact.role || "client"}
                        </Badge>

                        <Badge
                          tone={
                            signed
                              ? "green"
                              : waiver.agreement_waived
                                ? "purple"
                                : "yellow"
                          }
                        >
                          {signed
                            ? "Signed"
                            : waiver.agreement_waived
                              ? "Waived"
                              : "Unsigned"}
                        </Badge>

                        <Badge tone="slate">Required</Badge>
                      </div>

                      <p className="mt-2 break-all text-sm text-slate-400">
                        {contact.email}
                      </p>

                      {signedAgreement?.signed_at && (
                        <p className="mt-2 text-xs font-bold text-green-300">
                          Signed: {formatDate(signedAgreement.signed_at)}
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

                      {!signed && !waiver.agreement_waived && (
                        <button
                          type="button"
                          onClick={() => sendReminder(contact.id)}
                          disabled={sendingReminder !== null || waiverBusy}
                          className="w-full rounded-xl border border-yellow-500/70 px-4 py-2 text-sm font-black text-yellow-300 transition hover:bg-yellow-500/10 disabled:opacity-50"
                        >
                          {sendingReminder === contact.id
                            ? "Sending..."
                            : "Send Reminder"}
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
