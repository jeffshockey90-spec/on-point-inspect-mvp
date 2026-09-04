"use client";

import { useEffect, useState } from "react";

const ROLE_OPTIONS = ["client", "co-client", "realtor", "transaction coordinator", "other"];

function formatRole(role: string) {
  return String(role || "client")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleBadgeClass(role: string) {
  const clean = String(role || "").toLowerCase();
  if (clean.includes("client")) return "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]";
  if (clean.includes("realtor") || clean.includes("agent")) return "border-purple-500/40 bg-purple-500/10 text-[var(--fl-purple-text)]";
  if (clean.includes("transaction")) return "border-cyan-500/40 bg-cyan-500/10 text-[var(--fl-info-text)]";
  return "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]";
}

function StatusBadge({ active, activeText, inactiveText }: { active: boolean; activeText: string; inactiveText: string }) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-good-text)]"
          : "rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-warn-text)]"
      }
    >
      {active ? activeText : inactiveText}
    </span>
  );
}

function CompactToggle({ checked, onChange, title }: { checked: boolean; onChange: (checked: boolean) => void; title: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
        checked
          ? "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]"
          : "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]"
      }`}
    >
      {checked ? "✓ " : ""}{title}
    </button>
  );
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
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("client");
  const [agreementRequired, setAgreementRequired] = useState(true);
  const [portalAccess, setPortalAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [savedRealtors, setSavedRealtors] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("client");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  useEffect(() => {
    fetch("/api/realtors", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSavedRealtors(Array.isArray(d) ? d : d?.realtors || []))
      .catch(() => setSavedRealtors([]));
  }, []);

  async function loadContacts() {
    if (!inspectionId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/inspection-contacts?inspection_id=${inspectionId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not load contacts.");
      }
      setContacts(data.contacts || []);
    } catch (error: any) {
      console.error("Failed to load contacts:", error);
      setLoadError(error?.message || "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }

  async function seedDefaults() {
    // Skip anyone already on the inspection so "Add Existing" can't create
    // duplicate contacts (duplicate clients were showing up as extra "required
    // signature" rows).
    const existingEmails = new Set(
      contacts
        .map((c: any) => String(c.email || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const tasks: Promise<any>[] = [];
    if (defaultClientEmail && !existingEmails.has(String(defaultClientEmail).trim().toLowerCase())) {
      tasks.push(addContact({ name: defaultClientName || "Client", email: defaultClientEmail, phone: "", role: "client", agreement_required: true, portal_access: true, silent: true }));
    }
    if (defaultRealtorEmail && !existingEmails.has(String(defaultRealtorEmail).trim().toLowerCase())) {
      tasks.push(addContact({ name: defaultRealtorName || "Realtor", email: defaultRealtorEmail, phone: "", role: "realtor", agreement_required: false, portal_access: true, silent: true }));
    }
    await Promise.all(tasks);
    await loadContacts();
  }

  async function addContact(override?: { name: string; email: string; phone?: string; role: string; agreement_required: boolean; portal_access: boolean; silent?: boolean }) {
    const payload = override || { name, email, phone, role, agreement_required: agreementRequired, portal_access: portalAccess };
    if (!payload.name.trim() || !payload.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/inspection-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspection_id: inspectionId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!override?.silent) alert(data.error || "Failed to add contact.");
        return;
      }
      if (!override) {
        setName("");
        setEmail("");
        setPhone("");
        setRole("client");
        setAgreementRequired(true);
        setPortalAccess(true);
        setShowAddForm(false);
        await loadContacts();
      }
    } catch (error: any) {
      if (!override?.silent) {
        alert(error?.message || "Failed to add contact. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateContact(id: string, updates: any) {
    const res = await fetch("/api/inspection-contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to update contact.");
      return false;
    }
    await loadContacts();
    return true;
  }

  function startEdit(contact: any) {
    setEditingId(contact.id);
    setEditName(contact.name || "");
    setEditEmail(contact.email || "");
    setEditPhone(contact.phone || "");
    setEditRole(contact.role || "client");
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editEmail.trim()) {
      alert("Name and email are required.");
      return;
    }
    setSavingEdit(true);
    try {
      const ok = await updateContact(id, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        role: editRole,
      });
      if (ok) setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteContact(id: string) {
    if (!window.confirm("Delete this contact?")) return;
    const res = await fetch(`/api/inspection-contacts?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to delete contact.");
      return;
    }
    await loadContacts();
  }

  const fieldClass = "box-border h-[52px] min-w-0 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40";

  return (
    <section className="mb-6 w-full max-w-full overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] shadow-2xl shadow-black/20">
      <div className="border-b border-[var(--fl-raised)] bg-gradient-to-r from-[var(--fl-surface)] via-[var(--fl-surface-2)] to-[var(--fl-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fl-accent-text)]">Delivery Contacts</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">Client / Realtor Contacts</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">Compact contact cards with agreement and portal badges.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
            <button type="button" onClick={seedDefaults} className="rounded-2xl border border-teal-500/70 bg-teal-500/10 px-4 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-slate-950">Add Existing</button>
            <button type="button" onClick={() => setShowAddForm((current) => !current)} className="rounded-2xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400">{showAddForm ? "Hide Form" : "Add Contact"}</button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {showAddForm && (
          <div className="mb-5 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
            {savedRealtors.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Select a saved realtor (auto-fills below)
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const picked = savedRealtors.find(
                      (r) => String(r.id) === e.target.value
                    );
                    if (!picked) return;
                    setName(picked.name || "");
                    setEmail(picked.email || "");
                    setPhone(picked.phone || "");
                    setRole("realtor");
                    setAgreementRequired(false);
                    setPortalAccess(true);
                  }}
                  className={fieldClass}
                >
                  <option value="">— Choose a saved realtor —</option>
                  {savedRealtors.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                      {r.email ? ` — ${r.email}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" className={fieldClass} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" type="email" className={fieldClass} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={fieldClass} />
              <select
                value={role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  setRole(nextRole);
                  setAgreementRequired(nextRole === "client" || nextRole === "co-client");
                }}
                className={fieldClass}
              >
                {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{formatRole(item)}</option>)}
              </select>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CompactToggle checked={agreementRequired} onChange={setAgreementRequired} title="Agreement Required" />
              <CompactToggle checked={portalAccess} onChange={setPortalAccess} title="Portal Access" />
            </div>
            <button type="button" onClick={() => addContact()} disabled={saving} className="mt-4 w-full rounded-2xl bg-teal-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving..." : "Save Contact"}
            </button>
          </div>
        )}

        {loading && <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm text-[var(--fl-muted)]">Loading contacts...</div>}

        {!loading && loadError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center">
            <p className="text-lg font-bold text-[var(--fl-crit-text)]">Could not load contacts.</p>
            <p className="mt-2 text-sm text-[var(--fl-crit-text)]">{loadError}</p>
            <button
              type="button"
              onClick={loadContacts}
              className="mt-4 rounded-xl border border-red-400/60 px-5 py-2 text-sm font-semibold text-[var(--fl-crit-text)] transition hover:bg-red-500/10"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && contacts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center">
            <p className="text-lg font-bold text-[var(--fl-text)]">No contacts added yet.</p>
            <p className="mt-2 text-sm text-[var(--fl-muted)]">Add the client and realtor so delivery, portal access, and agreement requirements stay organized.</p>
          </div>
        )}

        {!loading && !loadError && contacts.length > 0 && (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <article key={contact.id} className="w-full overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 shadow-xl">
                {editingId === contact.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Contact name" className={fieldClass} />
                      <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email address" type="email" className={fieldClass} />
                      <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone number" className={fieldClass} />
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className={fieldClass}>
                        {ROLE_OPTIONS.map((item) => <option key={item} value={item}>{formatRole(item)}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => saveEdit(contact.id)} disabled={savingEdit} className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-60">
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={savingEdit} className="rounded-xl border border-[var(--fl-line)] px-5 py-2.5 text-sm font-semibold text-[var(--fl-muted)] transition hover:bg-[var(--fl-raised)] disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-lg font-semibold text-[var(--fl-text)]">{contact.name}</h3>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${roleBadgeClass(contact.role)}`}>{formatRole(contact.role)}</span>
                          {contact.agreement_required ? (
                            <StatusBadge active={Boolean(contact.agreement_signed)} activeText="Signed" inactiveText="Not Signed" />
                          ) : (
                            <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-raised)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                              No Signature Needed
                            </span>
                          )}
                          <StatusBadge active={Boolean(contact.portal_access)} activeText="Portal" inactiveText="No Portal" />
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-[var(--fl-muted)]">
                          <p className="break-all"><span className="font-bold text-[var(--fl-faint)]">Email:</span> {contact.email || "N/A"}</p>
                          <p className="break-all"><span className="font-bold text-[var(--fl-faint)]">Phone:</span> {contact.phone || "N/A"}</p>
                        </div>
                      </div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <button type="button" onClick={() => startEdit(contact)} className="flex-1 rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)] sm:flex-none">Edit</button>
                        <button type="button" onClick={() => deleteContact(contact.id)} className="flex-1 rounded-xl border border-red-500/70 bg-red-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-crit-text)] transition hover:bg-red-500 hover:text-[var(--fl-text)] sm:flex-none">Delete</button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--fl-raised)] pt-4">
                      <CompactToggle checked={Boolean(contact.agreement_required)} onChange={(checked) => updateContact(contact.id, { agreement_required: checked })} title="Agreement Required" />
                      <CompactToggle checked={Boolean(contact.portal_access)} onChange={(checked) => updateContact(contact.id, { portal_access: checked })} title="Portal Access" />
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
