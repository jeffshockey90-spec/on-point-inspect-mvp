"use client";

import { useEffect, useMemo, useState } from "react";

export default function AgreementStatusPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, [inspectionId]);

  async function loadContacts() {
    if (!inspectionId) return;

    setLoading(true);

    try {
      const res = await fetch(
        `/api/inspection-contacts?inspection_id=${inspectionId}`
      );

      const data = await res.json();

      setContacts(data.contacts || []);
    } finally {
      setLoading(false);
    }
  }

  const requiredContacts = useMemo(
    () =>
      contacts.filter((contact) =>
        Boolean(contact.agreement_required)
      ),
    [contacts]
  );

  const unsignedRequiredContacts = useMemo(
    () =>
      requiredContacts.filter(
        (contact) => !contact.agreement_signed
      ),
    [requiredContacts]
  );

  const allRequiredSigned =
    requiredContacts.length > 0 &&
    unsignedRequiredContacts.length === 0;

  async function sendReminder(contactId?: string) {
    setSendingReminder(contactId || "all");

    try {
      const res = await fetch("/api/send-agreement-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          contactId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send reminder.");
      }

      alert(`Sent ${data.sent?.length || 0} reminder email(s).`);
      await loadContacts();
    } catch (error: any) {
      alert(error.message || "Failed to send reminder.");
    } finally {
      setSendingReminder(null);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-teal-300">
            Agreement Status
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Track required client signatures before report delivery.
          </p>
        </div>

        {requiredContacts.length > 0 && !allRequiredSigned && (
          <button
            type="button"
            onClick={() => sendReminder()}
            disabled={sendingReminder !== null}
            className="rounded-xl border border-yellow-500 px-4 py-2 font-bold text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50"
          >
            {sendingReminder === "all"
              ? "Sending..."
              : "Remind All Unsigned"}
          </button>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-sm text-slate-400">
          Loading agreement status...
        </p>
      )}

      {!loading && requiredContacts.length === 0 && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
          No required agreement signers added yet. Add clients in the Client / Realtor Contacts section and check Agreement Required.
        </div>
      )}

      {!loading && requiredContacts.length > 0 && (
        <>
          <div
            className={`mt-4 rounded-xl border p-4 ${
              allRequiredSigned
                ? "border-green-600 bg-green-950/30"
                : "border-yellow-600 bg-yellow-950/20"
            }`}
          >
            <p
              className={`text-lg font-extrabold ${
                allRequiredSigned
                  ? "text-green-300"
                  : "text-yellow-300"
              }`}
            >
              {allRequiredSigned
                ? "All required agreements signed"
                : `${unsignedRequiredContacts.length} required signature${
                    unsignedRequiredContacts.length === 1 ? "" : "s"
                  } remaining`}
            </p>

            {!allRequiredSigned && (
              <p className="mt-1 text-sm text-slate-300">
                Recommended: do not publish/send the final report until all required clients have signed.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {requiredContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4"
              >
                <div>
                  <p className="font-bold text-white">
                    {contact.name}
                  </p>

                  <p className="text-sm text-slate-400">
                    {contact.email}
                  </p>

                  <p className="mt-1 text-xs uppercase tracking-wide text-teal-300">
                    {contact.role}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      contact.agreement_signed
                        ? "bg-green-500 text-slate-950"
                        : "border border-yellow-500 text-yellow-300"
                    }`}
                  >
                    {contact.agreement_signed ? "Signed" : "Unsigned"}
                  </span>

                  {!contact.agreement_signed && (
                    <button
                      type="button"
                      onClick={() => sendReminder(contact.id)}
                      disabled={sendingReminder !== null}
                      className="rounded-xl border border-yellow-500 px-3 py-2 text-sm font-bold text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50"
                    >
                      {sendingReminder === contact.id
                        ? "Sending..."
                        : "Send Reminder"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
