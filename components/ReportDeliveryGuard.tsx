"use client";

import { useEffect, useMemo, useState } from "react";

export default function ReportDeliveryGuard({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [contacts, setContacts] = useState<any[]>([]);

  useEffect(() => {
    async function loadContacts() {
      if (!inspectionId) return;

      try {
        const res = await fetch(
          `/api/inspection-contacts?inspection_id=${inspectionId}`
        );

        const data = await res.json();

        setContacts(data.contacts || []);
      } catch (error) {
        console.error("Failed to load agreement guard contacts:", error);
      }
    }

    loadContacts();
  }, [inspectionId]);

  const unsignedRequiredContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.agreement_required &&
          !contact.agreement_signed
      ),
    [contacts]
  );

  if (unsignedRequiredContacts.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-yellow-500 bg-yellow-950/20 p-5">
      <h2 className="text-2xl font-extrabold text-yellow-300">
        Agreement Signatures Pending
      </h2>

      <p className="mt-2 text-slate-300">
        {unsignedRequiredContacts.length} required client signature
        {unsignedRequiredContacts.length === 1 ? "" : "s"} still pending.
        Confirm agreements are signed before delivering the final report.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {unsignedRequiredContacts.map((contact) => (
          <span
            key={contact.id}
            className="rounded-xl border border-yellow-500 px-3 py-2 text-sm font-bold text-yellow-300"
          >
            {contact.name || contact.email}
          </span>
        ))}
      </div>
    </div>
  );
}
