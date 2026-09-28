"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: string | number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

function formatRole(role?: string | null) {
  const clean = String(role || "client").trim();
  return clean
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ResendConfirmationButton({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load the actual people on this inspection so the inspector can choose
  // exactly who gets the confirmation (e.g. only a second agent they added).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/inspection-contacts?inspection_id=${encodeURIComponent(String(inspectionId))}`
        );
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const withEmail: Contact[] = (data.contacts || []).filter(
          (c: Contact) => c.email && String(c.email).trim()
        );
        setContacts(withEmail);
        // Default: everyone selected.
        const initial: Record<string, boolean> = {};
        withEmail.forEach((c) => {
          initial[String(c.email).toLowerCase()] = true;
        });
        setSelected(initial);
      } catch {
        // Leave the list empty; the message below covers it.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [inspectionId]);

  const selectedEmails = contacts
    .map((c) => String(c.email).toLowerCase())
    .filter((email) => selected[email]);
  const allSelected = contacts.length > 0 && selectedEmails.length === contacts.length;

  function toggle(email: string) {
    setSelected((prev) => ({ ...prev, [email]: !prev[email] }));
  }

  function toggleAll() {
    const next: Record<string, boolean> = {};
    contacts.forEach((c) => {
      next[String(c.email).toLowerCase()] = !allSelected;
    });
    setSelected(next);
  }

  async function resend() {
    if (busy || selectedEmails.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/send-schedule-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, recipientEmails: selectedEmails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to resend.");

      const sentList = Array.isArray(data.sent) ? data.sent : [];
      const failedList = Array.isArray(data.failed) ? data.failed : [];

      if (sentList.length === 0) {
        setMsg({ ok: false, text: "No confirmation was sent — check the selected emails." });
      } else {
        const to = sentList
          .map((s: any) => s.email || s.recipient || s.to)
          .filter(Boolean)
          .join(", ");
        const failNote = failedList.length
          ? ` (${failedList.length} failed)`
          : "";
        setMsg({ ok: true, text: `Confirmation sent to ${to}${failNote}.` });
      }
    } catch (error: any) {
      setMsg({ ok: false, text: error?.message || "Failed to resend." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--fl-text)]">Resend Schedule Confirmation</p>
        {contacts.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-bold text-[var(--fl-accent-text)] underline-offset-2 hover:underline [touch-action:manipulation]"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--fl-muted)]">
        Choose who gets the &ldquo;Inspection Confirmed&rdquo; email — handy for a second agent, or if a copy was delayed.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-[var(--fl-muted)]">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--fl-crit-text)]">
          No contacts with an email on this inspection. Add one under &ldquo;Contacts &amp; Email Delivery&rdquo; first.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {contacts.map((c) => {
            const email = String(c.email).toLowerCase();
            return (
              <label
                key={String(c.id)}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 [touch-action:manipulation]"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[email])}
                  onChange={() => toggle(email)}
                  disabled={busy}
                  className="h-5 w-5 shrink-0 accent-teal-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-[var(--fl-text)]">
                      {c.name || c.email}
                    </span>
                    <span className="rounded-full border border-[var(--fl-line)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                      {formatRole(c.role)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--fl-muted)]">
                    {c.email}
                  </span>
                </span>
              </label>
            );
          })}

          <button
            type="button"
            onClick={resend}
            disabled={busy || selectedEmails.length === 0}
            className="min-h-[44px] w-full rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
          >
            {busy
              ? "Sending…"
              : `Resend to ${selectedEmails.length || "…"} ${selectedEmails.length === 1 ? "person" : "people"}`}
          </button>
        </div>
      )}

      {msg && (
        <p className={`mt-2 text-xs font-bold ${msg.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
