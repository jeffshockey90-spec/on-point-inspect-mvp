"use client";

import { useEffect, useState } from "react";

type Contact = {
  id?: string | number;
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

function isAgentRole(role?: string | null) {
  return /realtor|agent|transaction/.test(String(role || "").toLowerCase());
}

export default function SendReviewRequestButton({
  inspectionId,
  clientEmail,
  clientEmails,
  realtorEmail,
  reviewStatus,
}: {
  inspectionId: string;
  clientEmail?: string | null;
  clientEmails?: string[] | null;
  realtorEmail?: string | null;
  reviewStatus?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const alreadyRequested = String(reviewStatus || "")
    .toLowerCase()
    .includes("requested");

  // Fallback list from props if the inspection has no saved contacts yet.
  function fallbackContacts(): Contact[] {
    const list: Contact[] = [];
    const buyers = (
      clientEmails && clientEmails.length > 0 ? clientEmails : [clientEmail || ""]
    ).filter(Boolean);
    buyers.forEach((email, i) => list.push({ id: `c${i}`, email, role: "client" }));
    if (realtorEmail) list.push({ id: "r0", email: realtorEmail, role: "realtor" });
    return list;
  }

  async function loadContacts() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inspection-contacts?inspection_id=${encodeURIComponent(inspectionId)}`
      );
      const data = await res.json().catch(() => ({}));
      let list: Contact[] = (data.contacts || []).filter(
        (c: Contact) => c.email && String(c.email).trim()
      );
      if (list.length === 0) list = fallbackContacts();

      setContacts(list);
      // Default: buyers/clients pre-checked (the usual review target); agents
      // left unchecked but available to pick.
      const initial: Record<string, boolean> = {};
      list.forEach((c) => {
        initial[String(c.email).toLowerCase()] = !isAgentRole(c.role);
      });
      setSelected(initial);
    } catch {
      const list = fallbackContacts();
      setContacts(list);
      const initial: Record<string, boolean> = {};
      list.forEach((c) => {
        initial[String(c.email).toLowerCase()] = !isAgentRole(c.role);
      });
      setSelected(initial);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !loaded && !loading) loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedEmails = contacts
    .map((c) => String(c.email).toLowerCase())
    .filter((email) => selected[email]);

  function toggle(email: string) {
    setSelected((prev) => ({ ...prev, [email]: !prev[email] }));
  }

  async function send() {
    if (sending || selectedEmails.length === 0) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/send-review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, recipientEmails: selectedEmails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "Review request failed to send." });
        return;
      }
      setMsg({ ok: true, text: data.message || "Review request sent." });
      // Refresh so the review-status badge updates.
      setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      setMsg({ ok: false, text: error?.message || "Review request failed to send." });
    } finally {
      setSending(false);
    }
  }

  const buttonClass =
    "rounded-xl border border-yellow-500 px-5 py-3 font-bold text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={sending}
        className={buttonClass}
      >
        {sending
          ? "Sending…"
          : alreadyRequested
            ? "Send Review Request Again ▾"
            : "Request Review ▾"}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3 shadow-2xl">
            <p className="text-sm font-semibold text-[var(--fl-text)]">
              Who should get the review request?
            </p>
            <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
              Pick any clients or agents on this inspection.
            </p>

            {loading ? (
              <p className="mt-3 text-xs text-[var(--fl-muted)]">Loading contacts…</p>
            ) : contacts.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--fl-crit-text)]">
                No client or agent email on this inspection.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {contacts.map((c) => {
                  const email = String(c.email).toLowerCase();
                  return (
                    <label
                      key={String(c.id ?? email)}
                      className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 [touch-action:manipulation]"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selected[email])}
                        onChange={() => toggle(email)}
                        disabled={sending}
                        className="h-5 w-5 shrink-0 accent-yellow-500"
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
                  onClick={send}
                  disabled={sending || selectedEmails.length === 0}
                  className="min-h-[44px] w-full rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-yellow-400 disabled:opacity-50"
                >
                  {sending
                    ? "Sending…"
                    : `Send to ${selectedEmails.length || "…"} ${selectedEmails.length === 1 ? "person" : "people"}`}
                </button>
              </div>
            )}

            {msg && (
              <p
                className={`mt-2 text-xs font-bold ${
                  msg.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
                }`}
              >
                {msg.text}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
