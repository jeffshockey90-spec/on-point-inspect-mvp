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
type AgreementTemplate = {
  id: string;
  title?: string;
  name?: string;
  service_type?: string;
  state?: string;
  body?: string;
};

function templateLabel(t?: AgreementTemplate) {
  if (!t) return "Agreement";
  const base = t.title || t.name || t.service_type || "Agreement";
  const st = String(t.state || "").toUpperCase();
  // Tag the state so a per-state set (e.g. a Mold agreement per state) is
  // distinguishable at a glance; GENERAL/any-state templates aren't tagged.
  return st && st !== "GENERAL" ? `${base} · ${st}` : base;
}

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
  const [showPreview, setShowPreview] = useState(false);
  const [bill, setBill] = useState(true);
  const [sendAgreement, setSendAgreement] = useState(true);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        // Show ALL your active agreements (no state filter) so a per-state set
        // (e.g. a Mold agreement for every state) is never hidden — each option
        // is labeled with its state so you pick the right one. Auto-match below
        // still defaults to this inspection's state + service.
        const [p, t] = await Promise.all([
          fetch("/api/pricing", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(
            `/api/agreement-templates?activeOnly=true`,
            { cache: "no-store" },
          ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        // /api/pricing returns { config: { services: [...] }, ... } — the
        // services live under config.services (same shape New Inspection reads).
        // Include radon/mold too: they're common add-ons to a home inspection.
        const svc: ServiceOption[] = Array.isArray(p?.config?.services)
          ? p.config.services.filter((s: any) => String(s?.id) !== "home")
          : [];
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
    // Auto-match: prefer the template whose service matches AND whose state is
    // THIS inspection's state (so a per-state mold set picks this state's mold
    // agreement), then service-only, then name overlap. Always editable below.
    const svcId = String(svc.id || "").toLowerCase();
    const firstWord = String(svc.name || "").toLowerCase().split(" ")[0] || "~none~";
    const inspState = String(agreementState || propertyState || "").toUpperCase();
    const svcMatch = (tpl: AgreementTemplate) =>
      String(tpl.service_type || "").toLowerCase() === svcId ||
      `${tpl.service_type || ""} ${templateLabel(tpl)}`.toLowerCase().includes(firstWord);
    const match =
      templates.find(
        (tpl) => svcMatch(tpl) && String(tpl.state || "").toUpperCase() === inspState,
      ) ||
      templates.find(
        (tpl) => svcMatch(tpl) && String(tpl.state || "").toUpperCase() === "GENERAL",
      ) ||
      templates.find(svcMatch);
    setTemplateId(match ? String(match.id) : "");
    setShowPreview(false);
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

    // 2) Attach the add-on agreement + re-prompt the client (without re-locking
    //    the delivered report), then send it. The prepare endpoint handles the
    //    attach + delivery-override + un-signing the client so the send finds a
    //    recipient even though they already signed the original agreement.
    if (sendAgreement && templateId) {
      try {
        const prep = await fetch("/api/inspections/add-service-agreement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId, templateId }),
        });
        const pd = await prep.json().catch(() => ({}));
        if (!prep.ok) throw new Error(pd?.error || "could not attach agreement");
        if (!pd?.hasSigner) {
          failed.push(
            "agreement attached, but no client contact with an email to sign it — add a client email, then send from the Agreements section",
          );
        } else {
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
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setShowPreview(false);
                }}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              >
                <option value="">— no agreement —</option>
                {templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {templateLabel(t)}
                  </option>
                ))}
              </select>

              {templateId && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--fl-accent-text)]">
                    ✓ {templateLabel(templates.find((t) => String(t.id) === templateId))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="text-xs font-semibold text-[var(--fl-info-text)] underline [touch-action:manipulation]"
                  >
                    {showPreview ? "Hide preview" : "👁 Preview agreement"}
                  </button>
                </div>
              )}

              {showPreview && templateId && (
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-xs leading-5 text-[var(--fl-muted)]">
                  {(templates.find((t) => String(t.id) === templateId)?.body || "").trim() ||
                    "This agreement has no preview text saved."}
                </div>
              )}
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
