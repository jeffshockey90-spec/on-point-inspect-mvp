"use client";

import { useEffect, useRef, useState } from "react";

// "➕ Add a service" — when a client requests an add-on AFTER the inspection is
// already created (and often already paid + signed), bill it and get its
// agreement signed from ONE place, WITHOUT disturbing the original job:
//  - Billing: a SEPARATE invoice for the add-on (never touches the inspection's
//    paid balance, so a delivered report stays delivered).
//  - Agreement: appends the add-on's agreement template to the inspection
//    (preserving the signed one) and emails the client to sign it. Agreement
//    completeness is per-contact, so this doesn't re-lock the delivered report.
type ServiceOption = { id: string; name: string; price: number | string };
type AgreementTemplate = { id: string; name?: string; service_type?: string };

export default function AddServicePanel({
  inspectionId,
  propertyState,
  agreementState,
  currentTemplateIds,
  clientName,
  clientEmail,
  clientPhone,
}: {
  inspectionId: string;
  propertyState?: string | null;
  agreementState?: string | null;
  currentTemplateIds?: string[] | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [bill, setBill] = useState(true);
  const [sendAgreement, setSendAgreement] = useState(true);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [p, t] = await Promise.all([
          fetch("/api/pricing", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(
            `/api/agreement-templates?state=${encodeURIComponent(propertyState || "")}&activeOnly=true`,
            { cache: "no-store" },
          ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        const svc: ServiceOption[] = Array.isArray(p?.services) ? p.services : [];
        setServices(svc);
        setTemplates(Array.isArray(t?.templates) ? t.templates : []);
      } catch {
        /* keep manual entry working even if lists fail to load */
      }
    })();
  }, [open, propertyState]);

  function pickService(id: string) {
    const svc = services.find((s) => String(s.id) === id);
    if (!svc) return;
    setName(svc.name || "");
    const n = Number(String(svc.price).replace(/[^0-9.]/g, ""));
    setPrice(Number.isFinite(n) && n > 0 ? String(n) : "");
    // Auto-match an agreement template to the service name, if one looks right.
    const match = templates.find((tpl) =>
      String(tpl.service_type || tpl.name || "")
        .toLowerCase()
        .includes(String(svc.name || "").toLowerCase().split(" ")[0] || "~none~"),
    );
    if (match) setTemplateId(String(match.id));
  }

  async function addService() {
    if (busyRef.current) return;
    const serviceName = name.trim();
    if (!serviceName) {
      setMsg({ ok: false, text: "Enter the service name." });
      return;
    }
    const priceNum = Number(String(price).replace(/[^0-9.]/g, ""));
    if (bill && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      setMsg({ ok: false, text: "Enter a price to bill the client." });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMsg(null);

    const done: string[] = [];
    const failed: string[] = [];

    // 1) Separate invoice for the add-on, then send it.
    if (bill) {
      try {
        const createRes = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspection_id: inspectionId,
            client_name: clientName || "",
            client_email: clientEmail || "",
            client_phone: clientPhone || "",
            line_items: [{ description: serviceName, quantity: 1, unitPrice: priceNum }],
          }),
        });
        const created = await createRes.json().catch(() => ({}));
        if (!createRes.ok || !created?.invoice?.id) {
          throw new Error(created?.error || "Could not create the invoice.");
        }
        const sendRes = await fetch(`/api/invoices/${created.invoice.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!sendRes.ok) {
          const sd = await sendRes.json().catch(() => ({}));
          // The invoice exists; only the send failed.
          failed.push(`invoice created but not sent (${sd?.error || "send failed"})`);
        } else {
          done.push(`invoice sent for $${priceNum.toFixed(2)}`);
        }
      } catch (e: any) {
        failed.push(e?.message || "invoice failed");
      }
    }

    // 2) Attach the add-on agreement (append, preserve existing) + send it.
    if (sendAgreement && templateId) {
      try {
        const nextIds = Array.from(
          new Set([...(currentTemplateIds || []).map(String), String(templateId)]),
        );
        const upd = await fetch("/api/update-agreement-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionId,
            agreementState: agreementState || propertyState || "",
            agreementTemplateIds: nextIds,
          }),
        });
        if (!upd.ok) {
          const ud = await upd.json().catch(() => ({}));
          throw new Error(ud?.error || "could not attach agreement");
        }
        const sent = await fetch("/api/send-agreement-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId, recipientType: "client" }),
        });
        if (!sent.ok) {
          const sd = await sent.json().catch(() => ({}));
          failed.push(`agreement attached but not sent (${sd?.error || "send failed"})`);
        } else {
          done.push("agreement sent to sign");
        }
      } catch (e: any) {
        failed.push(e?.message || "agreement failed");
      }
    }

    setBusy(false);
    busyRef.current = false;

    if (failed.length === 0 && done.length > 0) {
      setMsg({ ok: true, text: `Added “${serviceName}” — ${done.join(" · ")}.` });
      setName("");
      setPrice("");
      setTemplateId("");
    } else if (done.length > 0) {
      setMsg({ ok: false, text: `${done.join(" · ")}; but ${failed.join("; ")}.` });
    } else {
      setMsg({ ok: false, text: failed.join("; ") || "Nothing to do — pick billing or an agreement." });
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left [touch-action:manipulation]"
      >
        <span>
          <span className="text-lg font-bold text-[var(--fl-text)]">➕ Add a Service</span>
          <span className="ml-2 text-xs text-[var(--fl-muted)]">
            Bill &amp; get an agreement for an add-on — without touching the original job.
          </span>
        </span>
        <span aria-hidden className="text-[var(--fl-muted)]">{open ? "⌃" : "⌄"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {services.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">
                Pick from your services (or type a custom one below)
              </span>
              <select
                onChange={(e) => pickService(e.target.value)}
                defaultValue=""
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              >
                <option value="">— choose a service —</option>
                {services.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {Number(String(s.price).replace(/[^0-9.]/g, "")) > 0
                      ? ` — $${Number(String(s.price).replace(/[^0-9.]/g, ""))}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">Service name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Radon Test"
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">Price ($)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              />
            </label>
          </div>

          {templates.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--fl-muted)]">
                Agreement for this service (optional)
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              >
                <option value="">— no agreement —</option>
                {templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name || t.service_type || "Agreement"}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-[var(--fl-text)]">
            <label className="inline-flex items-center gap-2 [touch-action:manipulation]">
              <input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} />
              Send a separate invoice
            </label>
            <label className="inline-flex items-center gap-2 [touch-action:manipulation]">
              <input
                type="checkbox"
                checked={sendAgreement}
                onChange={(e) => setSendAgreement(e.target.checked)}
                disabled={!templateId}
              />
              Send the agreement to sign
            </label>
          </div>

          <button
            type="button"
            onClick={addService}
            disabled={busy}
            className="w-full rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-teal-400 disabled:opacity-60 [touch-action:manipulation]"
          >
            {busy ? "Adding…" : "Add Service"}
          </button>

          {msg && (
            <p
              className={`text-sm font-semibold ${
                msg.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"
              }`}
            >
              {msg.text}
            </p>
          )}

          <p className="text-[11px] text-[var(--fl-faint)]">
            The invoice is separate, so it never changes the original inspection&apos;s paid
            balance. The agreement is added alongside the signed one (it won&apos;t re-lock a
            delivered report).
          </p>
        </div>
      )}
    </section>
  );
}
