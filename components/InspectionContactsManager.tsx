"use client";

import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  "client",
  "co-client",
  "realtor",
  "transaction coordinator",
  "other",
];

function formatRole(role: string) {
  return String(role || "client")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleBadgeClass(role: string) {
  const clean = String(role || "").toLowerCase();

  if (clean.includes("client")) {
    return "border-teal-500/40 bg-teal-500/10 text-teal-300";
  }

  if (clean.includes("realtor") || clean.includes("agent")) {
    return "border-purple-500/40 bg-purple-500/10 text-purple-300";
  }

  if (clean.includes("transaction")) {
    return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
  }

  return "border-slate-600 bg-slate-800/60 text-slate-300";
}

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
  const [saving, setSaving] = useState(false);

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
    } catch (error) {
      console.error("Failed to load contacts:", error);
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
          phone: "",
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
          phone: "",
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

    try {
      setSaving(true);

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
    } finally {
      setSaving(false);
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

  const fieldClass =
    "box-border h-[52px] min-w-0 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40";

  return (
    <section className="mb-8 w-full max-w-full overflow-hidden rounded-3xl border border-slate-700 bg-[#071224] shadow-2xl shadow-black/20">
      <div className="border-b border-slate-800 bg-gradient-to-r from-[#0f172a] via-[#0b1628] to-[#071224] p-5 md:p-6">
        <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-400">
              Delivery Contacts
            </p>

            <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">
              Client / Realtor Contacts
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Add clients, co-clients, realtors, and transaction contacts. Agreement emails stay limited to contacts marked as agreement required.
            </p>
          </div>

          <button
            type="button"
            onClick={seedDefaults}
            className="w-full rounded-2xl border border-teal-500/70 bg-teal-500/10 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500 hover:text-slate-950 sm:w-auto"
          >
            Add Existing Client/Realtor
          </button>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#020817]/80 p-4">
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contact name"
              className={fieldClass}
            />

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              className={fieldClass}
            />

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className={fieldClass}
            />

            <div className="relative min-w-0">
              <select
                value={role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  setRole(nextRole);
                  setAgreementRequired(
                    nextRole === "client" || nextRole === "co-client"
                  );
                }}
                className="box-border h-[52px] min-w-0 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40 appearance-none"
              >
                {ROLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {formatRole(item)}
                  </option>
                ))}
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-sm font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={agreementRequired}
                  onChange={(e) => setAgreementRequired(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-teal-400"
                />
                <span className="min-w-0 break-words">Agreement Required</span>
              </label>

              <label className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-sm font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={portalAccess}
                  onChange={(e) => setPortalAccess(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-teal-400"
                />
                <span className="min-w-0 break-words">Portal Access</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => addContact()}
              disabled={saving}
              className="w-full rounded-2xl bg-teal-500 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Contact"}
            </button>
          </div>
        </div>

        <div className="mt-5">
          {loading && (
            <div className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-6 text-sm text-slate-400">
              Loading contacts...
            </div>
          )}

          {!loading && contacts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-[#020817]/70 p-8 text-center">
              <p className="text-lg font-bold text-white">No contacts added yet.</p>
              <p className="mt-2 text-sm text-slate-400">
                Add the client and realtor here so emails, portal access, and agreement requirements stay organized.
              </p>
            </div>
          )}

          {!loading && contacts.length > 0 && (
            <div className="space-y-4">
              {contacts.map((contact) => (
                <article
                  key={contact.id}
                  className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-700 bg-[#020817]/80 p-5 shadow-xl"
                >
                  <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="break-words text-xl font-black text-white">
                          {contact.name}
                        </h3>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${roleBadgeClass(
                            contact.role
                          )}`}
                        >
                          {formatRole(contact.role)}
                        </span>

                        <span
                          className={
                            contact.agreement_signed
                              ? "rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-300"
                              : "rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-300"
                          }
                        >
                          {contact.agreement_signed ? "Signed" : "Not Signed"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                        <p className="w-full overflow-hidden">
                          <span className="font-bold text-slate-500">Email:</span>{" "}
                          <span className="break-all">{contact.email || "N/A"}</span>
                        </p>

                        <p className="w-full overflow-hidden">
                          <span className="font-bold text-slate-500">Phone:</span>{" "}
                          <span className="break-all">{contact.phone || "N/A"}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteContact(contact.id)}
                      className="w-full rounded-xl border border-red-500/70 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-500 hover:text-white sm:w-auto"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-4 grid w-full gap-3 border-t border-slate-800 pt-4 lg:grid-cols-2">
                    <label className="flex w-full min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-sm font-bold text-slate-300">
                      <span>Agreement required</span>
                      <input
                        type="checkbox"
                        checked={Boolean(contact.agreement_required)}
                        onChange={(e) =>
                          updateContact(contact.id, {
                            agreement_required: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-teal-400"
                      />
                    </label>

                    <label className="flex w-full min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-sm font-bold text-slate-300">
                      <span>Portal access</span>
                      <input
                        type="checkbox"
                        checked={Boolean(contact.portal_access)}
                        onChange={(e) =>
                          updateContact(contact.id, {
                            portal_access: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-teal-400"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
