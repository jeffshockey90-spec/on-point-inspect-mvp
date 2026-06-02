"use client";

import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  "client",
  "co-client",
  "realtor",
  "transaction coordinator",
  "other",
];

export default function InspectionContactsManager({
  inspectionId,
  defaultClientName,
  defaultClientEmail,
  defaultRealtorName,
  defaultRealtorEmail,
}: {
  inspectionId: string;
  defaultClientName?: string | null;
  defaultClientEmail?: string | null;
  defaultRealtorName?: string | null;
  defaultRealtorEmail?: string | null;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("client");
  const [agreementRequired, setAgreementRequired] = useState(true);
  const [portalAccess, setPortalAccess] = useState(true);

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

  async function seedDefaults() {
    const tasks: Promise<any>[] = [];

    if (defaultClientEmail) {
      tasks.push(
        addContact({
          name: defaultClientName || "Client",
          email: defaultClientEmail,
          role: "client",
          agreement_required: true,
          portal_access: true,
          silent: true,
        })
      );
    }

    if (defaultRealtorEmail) {
      tasks.push(
        addContact({
          name: defaultRealtorName || "Realtor",
          email: defaultRealtorEmail,
          role: "realtor",
          agreement_required: false,
          portal_access: true,
          silent: true,
        })
      );
    }

    await Promise.all(tasks);
    await loadContacts();
  }

  async function addContact(
    override?: {
      name: string;
      email: string;
      phone?: string;
      role: string;
      agreement_required: boolean;
      portal_access: boolean;
      silent?: boolean;
    }
  ) {
    const payload = override || {
      name,
      email,
      phone,
      role,
      agreement_required: agreementRequired,
      portal_access: portalAccess,
    };

    if (!payload.name.trim() || !payload.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    const res = await fetch("/api/inspection-contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspection_id: inspectionId,
        ...payload,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (!override?.silent) {
        alert(data.error || "Failed to add contact.");
      }
      return;
    }

    if (!override) {
      setName("");
      setEmail("");
      setPhone("");
      setRole("client");
      setAgreementRequired(true);
      setPortalAccess(true);
      await loadContacts();
    }
  }

  async function updateContact(id: string, updates: any) {
    const res = await fetch("/api/inspection-contacts", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        ...updates,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to update contact.");
      return;
    }

    await loadContacts();
  }

  async function deleteContact(id: string) {
    if (!window.confirm("Delete this contact?")) return;

    const res = await fetch(`/api/inspection-contacts?id=${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to delete contact.");
      return;
    }

    await loadContacts();
  }

  return (
    <section className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-300">
            Client / Realtor Contacts
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Add multiple clients, co-clients, realtors, and transaction contacts.
          </p>
        </div>

        <button
          type="button"
          onClick={seedDefaults}
          className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10"
        >
          Add Existing Client/Realtor
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_180px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-400"
        />

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-400"
        />

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-400"
        />

        <select
          value={role}
          onChange={(e) => {
            const nextRole = e.target.value;
            setRole(nextRole);
            setAgreementRequired(
              nextRole === "client" || nextRole === "co-client"
            );
          }}
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-teal-400"
        >
          {ROLE_OPTIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={agreementRequired}
            onChange={(e) => setAgreementRequired(e.target.checked)}
          />
          Agreement required
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={portalAccess}
            onChange={(e) => setPortalAccess(e.target.checked)}
          />
          Portal access
        </label>

        <button
          type="button"
          onClick={() => addContact()}
          className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-slate-950 hover:bg-teal-400"
        >
          Add Contact
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {loading && (
          <p className="text-sm text-slate-400">Loading contacts...</p>
        )}

        {!loading && contacts.length === 0 && (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
            No portal contacts added yet.
          </div>
        )}

        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-xl border border-slate-700 bg-slate-950 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-white">{contact.name}</h3>
                <p className="text-sm text-slate-400">{contact.email}</p>
                {contact.phone && (
                  <p className="text-sm text-slate-500">{contact.phone}</p>
                )}
                <p className="mt-1 text-xs uppercase tracking-wide text-teal-300">
                  {contact.role}
                </p>
              </div>

              <button
                type="button"
                onClick={() => deleteContact(contact.id)}
                className="rounded-xl border border-red-500 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
              >
                Delete
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(contact.agreement_required)}
                  onChange={(e) =>
                    updateContact(contact.id, {
                      agreement_required: e.target.checked,
                    })
                  }
                />
                Agreement required
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(contact.portal_access)}
                  onChange={(e) =>
                    updateContact(contact.id, {
                      portal_access: e.target.checked,
                    })
                  }
                />
                Portal access
              </label>

              <span
                className={
                  contact.agreement_signed
                    ? "text-green-300"
                    : "text-yellow-300"
                }
              >
                {contact.agreement_signed ? "Signed" : "Not signed"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
