"use client";

import { useEffect, useRef, useState } from "react";

// Full-parity status for add-on services billed on this inspection: per add-on
// invoice shows paid status + date with Send Receipt / View / Resend, and the
// client agreement shows signed status + date with Send Signed Copy (or Resend).
// Alerts already fire server-side (webhook "💵 Invoice Paid" push; sign-agreement
// push on signing) — this surfaces the state + the actions.
export type AddOnInvoice = {
  id: string;
  service: string;
  total: number;
  paid: boolean;
  status: string;
  paidAt?: string | null;
};

function money(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
function shortDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function AddOnStatusPanel({
  inspectionId,
  invoices,
  agreementSigned,
  clientEmail,
}: {
  inspectionId: string;
  invoices: AddOnInvoice[];
  agreementSigned: boolean | null;
  clientEmail?: string | null;
}) {
  const [signedAt, setSignedAt] = useState<string>("");
  const [signedAgreementId, setSignedAgreementId] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const busyRef = useRef(false);

  // Load the signed agreement record (for the signed date + "send signed copy").
  useEffect(() => {
    if (agreementSigned !== true) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/signed-agreements?inspection_id=${encodeURIComponent(inspectionId)}`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        const list: any[] = Array.isArray(data?.agreements)
          ? data.agreements
          : Array.isArray(data?.signedAgreements)
            ? data.signedAgreements
            : Array.isArray(data)
              ? data
              : [];
        const latest = list
          .slice()
          .sort((a, b) =>
            String(b?.signed_at || b?.created_at || "").localeCompare(
              String(a?.signed_at || a?.created_at || ""),
            ),
          )[0];
        if (latest) {
          setSignedAt(String(latest.signed_at || latest.created_at || ""));
          setSignedAgreementId(String(latest.id || ""));
        }
      } catch {
        /* status still shows from the prop */
      }
    })();
  }, [inspectionId, agreementSigned]);

  if (!invoices || invoices.length === 0) return null;

  async function run(key: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setNote(null);
    try {
      await fn();
    } catch (e: any) {
      setNote({ ok: false, text: e?.message || "Something went wrong." });
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function sendReceipt(invoiceId: string) {
    const res = await fetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt: true }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error || "Could not send the receipt.");
    }
    setNote({ ok: true, text: "Receipt sent to the client." });
  }

  async function resendInvoice(invoiceId: string) {
    const res = await fetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error || "Could not resend the invoice.");
    }
    setNote({ ok: true, text: "Invoice resent to the client." });
  }

  async function sendSignedCopy() {
    if (!signedAgreementId) throw new Error("No signed agreement on file yet.");
    const res = await fetch("/api/send-signed-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, agreementId: signedAgreementId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error || "Could not send the signed copy.");
    }
    setNote({ ok: true, text: "Signed agreement copy sent to the client." });
  }

  async function resendAgreement() {
    const prep = await fetch("/api/inspections/add-service-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId }),
    });
    const pd = await prep.json().catch(() => ({}));
    if (!prep.ok) throw new Error(pd?.error || "Could not prepare the agreement.");
    if (!pd?.hasSigner) {
      throw new Error("No client contact with an email to sign it — add a client email first.");
    }
    const sent = await fetch("/api/send-agreement-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionId, recipientType: "client" }),
    });
    if (!sent.ok) {
      const d = await sent.json().catch(() => ({}));
      throw new Error(d?.error || "Could not send the agreement.");
    }
    setNote({ ok: true, text: "Agreement sent to the client to sign." });
  }

  return (
    <section className="mb-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 print:hidden">
      <h3 className="text-lg font-bold text-[var(--fl-text)]">Add-on Services</h3>
      <p className="mb-3 mt-0.5 text-xs text-[var(--fl-muted)]">
        Services added after the original job — payment, agreement, and copies to send.
      </p>

      <ul className="space-y-2">
        {invoices.map((inv) => (
          <li
            key={inv.id}
            className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--fl-text)]">
                {inv.service} <span className="text-[var(--fl-muted)]">· {money(inv.total)}</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {inv.paid ? (
                  <Pill tone="good">Paid ✓{inv.paidAt ? ` · ${shortDate(inv.paidAt)}` : ""}</Pill>
                ) : String(inv.status).toLowerCase() === "draft" ? (
                  <Pill tone="muted">Unpaid · Draft</Pill>
                ) : (
                  <Pill tone="warn">Unpaid</Pill>
                )}
                {agreementSigned === true ? (
                  <Pill tone="good">Signed ✓{signedAt ? ` · ${shortDate(signedAt)}` : ""}</Pill>
                ) : agreementSigned === false ? (
                  <Pill tone="warn">Unsigned</Pill>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {inv.paid ? (
                <ActionBtn
                  busy={busy === `receipt:${inv.id}`}
                  onClick={() => run(`receipt:${inv.id}`, () => sendReceipt(inv.id))}
                >
                  📧 Send receipt
                </ActionBtn>
              ) : (
                <ActionBtn
                  busy={busy === `resend:${inv.id}`}
                  onClick={() => run(`resend:${inv.id}`, () => resendInvoice(inv.id))}
                >
                  📧 Resend invoice
                </ActionBtn>
              )}
              <a
                href={`/invoices/${inv.id}/print`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] [touch-action:manipulation]"
              >
                👁 View {inv.paid ? "receipt" : "invoice"}
              </a>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-[var(--fl-text)]">Service agreement</span>
          {agreementSigned === true ? (
            <Pill tone="good">Signed ✓{signedAt ? ` · ${shortDate(signedAt)}` : ""}</Pill>
          ) : agreementSigned === false ? (
            <Pill tone="warn">Awaiting signature</Pill>
          ) : (
            <Pill tone="muted">—</Pill>
          )}
        </div>
        <p className="mt-1 text-[11px] text-[var(--fl-muted)]">
          Add-on agreements are combined into one client signing — this covers every add-on above.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {agreementSigned === true ? (
            <ActionBtn
              busy={busy === "signedcopy"}
              onClick={() => run("signedcopy", sendSignedCopy)}
            >
              📧 Send signed copy
            </ActionBtn>
          ) : (
            <ActionBtn busy={busy === "resendagr"} onClick={() => run("resendagr", resendAgreement)}>
              📧 Resend agreement
            </ActionBtn>
          )}
        </div>
      </div>

      {note && (
        <p
          className={`mt-3 text-sm font-semibold ${
            note.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
          }`}
        >
          {note.text}
        </p>
      )}
    </section>
  );
}

function ActionBtn({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-lg border border-teal-400/50 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/20 disabled:opacity-60 [touch-action:manipulation]"
    >
      {busy ? "…" : children}
    </button>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn" | "muted";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]"
      : tone === "warn"
        ? "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]"
        : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>{children}</span>
  );
}
