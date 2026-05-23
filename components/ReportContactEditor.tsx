"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ReportContactEditor({
  inspection,
}: {
  inspection: any;
}) {
  const [clientName, setClientName] = useState(
    inspection.client_name || ""
  );

  const [clientEmail, setClientEmail] = useState(
    inspection.client_email || ""
  );

  const [clientPhone, setClientPhone] = useState(
    inspection.client_phone || ""
  );

  const [realtorName, setRealtorName] = useState(
    inspection.realtor_name || ""
  );

  const [realtorEmail, setRealtorEmail] = useState(
    inspection.realtor_email || ""
  );

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");

  async function saveContacts() {
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("inspections")
      .update({
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        realtor_name: realtorName,
        realtor_email: realtorEmail,
      })
      .eq("id", inspection.id);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Contact info updated.");
    setSaving(false);
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-5 print:hidden">
      <h2 className="mb-5 text-xl font-bold text-teal-400">
        Edit Client & Realtor Info
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <input
          value={clientName}
          onChange={(e) =>
            setClientName(e.target.value)
          }
          placeholder="Client Name"
          className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          value={clientEmail}
          onChange={(e) =>
            setClientEmail(e.target.value)
          }
          placeholder="Client Email"
          className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          value={clientPhone}
          onChange={(e) =>
            setClientPhone(e.target.value)
          }
          placeholder="Client Phone"
          className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          value={realtorName}
          onChange={(e) =>
            setRealtorName(e.target.value)
          }
          placeholder="Realtor Name"
          className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          value={realtorEmail}
          onChange={(e) =>
            setRealtorEmail(e.target.value)
          }
          placeholder="Realtor Email"
          className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-white md:col-span-2"
        />
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          onClick={saveContacts}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : "Save Contact Info"}
        </button>

        {message && (
          <p className="text-sm text-teal-300">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}