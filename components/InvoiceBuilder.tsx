"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "../lib/locale";

type LineItem = { description: string; quantity: number; unitPrice: number };

type Props = {
  initialInvoice?: any;
  inspectionId?: string | null;
  currency?: string;
};

export default function InvoiceBuilder({ initialInvoice, inspectionId, currency = "USD" }: Props) {
  const router = useRouter();
  const money = (value: number) => formatMoney(value, currency, { maximumFractionDigits: 2 });
  const editing = Boolean(initialInvoice?.id);

  const [clientName, setClientName] = useState(initialInvoice?.client_name || "");
  const [clientEmail, setClientEmail] = useState(initialInvoice?.client_email || "");
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoice?.invoice_number || "");
  const [dueDate, setDueDate] = useState(initialInvoice?.due_date || "");
  const [notes, setNotes] = useState(initialInvoice?.notes || "");
  const [items, setItems] = useState<LineItem[]>(
    Array.isArray(initialInvoice?.line_items) && initialInvoice.line_items.length
      ? initialInvoice.line_items.map((li: any) => ({
          description: li.description || "",
          quantity: Number(li.quantity) || 1,
          unitPrice: Number(li.unitPrice) || 0,
        }))
      : [{ description: "", quantity: 1, unitPrice: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // The inspector's price sheet, so the description field can offer their
  // services (with the price auto-filled) plus a Custom option.
  const [services, setServices] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.config?.services)) {
          setServices(json.config.services);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function serviceDefaultPrice(s: any): number {
    if (s?.type === "flat") return Number(s.flatPrice) || 0;
    if (s?.type === "flat_plus_per_unit") return Number(s.baseFee) || 0;
    return Number(s.basePrice) || 0; // sqft_formula base price
  }

  function onServiceSelect(index: number, value: string) {
    if (value === "__custom__") {
      updateItem(index, { description: "" });
      return;
    }
    const svc = services.find((s) => String(s.id) === value);
    if (svc) {
      updateItem(index, {
        description: svc.name,
        unitPrice: serviceDefaultPrice(svc),
      });
    }
  }

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
        0
      ),
    [items]
  );

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function persist(): Promise<any> {
    const payload = {
      client_name: clientName,
      client_email: clientEmail,
      invoice_number: invoiceNumber,
      due_date: dueDate || null,
      notes,
      line_items: items,
      inspection_id: inspectionId || initialInvoice?.inspection_id || null,
    };
    const res = await fetch(
      editing ? `/api/invoices/${initialInvoice.id}` : "/api/invoices",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to save invoice.");
    return json.invoice;
  }

  async function save() {
    if (saving || sending) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await persist();
      router.push("/invoices");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAndSend() {
    if (saving || sending) return;
    if (!clientEmail.trim()) {
      setError("Add a client email before sending the invoice.");
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      // Save (create or update) first, then send using the resulting id -- so a
      // brand-new invoice can be created and sent in one step.
      const inv = await persist();
      const targetId = inv?.id || initialInvoice?.id;
      if (!targetId) throw new Error("Could not save the invoice.");
      const res = await fetch(`/api/invoices/${targetId}/send`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to send invoice.");
      router.push("/invoices");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to send invoice.");
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "w-full min-w-0 rounded-lg border border-[#232b38] bg-[#0a0e13] px-3 py-2 text-white outline-none focus:border-teal-400";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {error && (
        <div className="rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm font-bold text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Client name</span>
          <input className={inputClass} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Client email</span>
          <input className={inputClass} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@email.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Invoice # (optional)</span>
          <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-1001" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Due date</span>
          <input className={inputClass} type="date" value={dueDate || ""} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      <div className="rounded-2xl border border-[#232b38] bg-[#071224] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-teal-300">Line items</h3>
          <button type="button" onClick={addItem} className="rounded-lg border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/10">
            + Add line item
          </button>
        </div>

        <div className="space-y-3">
          {items.map((li, i) => {
            const amount = (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0);
            return (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <label className="col-span-12 min-w-0 sm:col-span-6">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#59626f]">Description</span>
                  {services.length > 0 ? (
                    <select
                      className={inputClass}
                      value={
                        services.find((s) => s.name === li.description)?.id ?? "__custom__"
                      }
                      onChange={(e) => onServiceSelect(i, e.target.value)}
                    >
                      <option value="__custom__">Custom / other…</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {services.length === 0 ||
                  !services.some((s) => s.name === li.description) ? (
                    <input
                      className={`${inputClass}${services.length > 0 ? " mt-2" : ""}`}
                      value={li.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                      placeholder="Home inspection, radon test, etc."
                    />
                  ) : null}
                </label>
                <label className="col-span-4 min-w-0 sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#59626f]">Qty</span>
                  <input className={inputClass} type="number" min="0" step="1" value={li.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                </label>
                <label className="col-span-4 min-w-0 sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#59626f]">Unit price</span>
                  <input className={inputClass} type="number" min="0" step="0.01" value={li.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} />
                </label>
                <div className="col-span-3 min-w-0 truncate pb-2 text-right font-bold text-white [font-variant-numeric:tabular-nums] sm:col-span-1">
                  {money(amount)}
                </div>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length <= 1} className="col-span-1 min-w-0 pb-2 text-lg text-[#8a93a3] hover:text-red-300 disabled:opacity-30" aria-label="Remove line item">
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-[#232b38] pt-4">
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Total</p>
            <p className="text-3xl font-semibold text-teal-300 [font-variant-numeric:tabular-nums]">{money(subtotal)}</p>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">Notes (optional)</span>
        <textarea className={`${inputClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note, etc." />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-wait disabled:opacity-70">
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving…
            </>
          ) : editing ? (
            "Save Invoice"
          ) : (
            "Create Invoice"
          )}
        </button>
        <button type="button" onClick={saveAndSend} disabled={saving || sending} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500 bg-cyan-500/10 px-6 py-3 font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-70">
          {sending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Sending…
            </>
          ) : editing ? (
            "Save & Send to Client"
          ) : (
            "Create & Send"
          )}
        </button>
        <button type="button" onClick={() => router.push("/invoices")} className="rounded-xl border border-[#232b38] px-6 py-3 font-bold text-[#e8ecf3] hover:bg-[#1a212c]">
          Cancel
        </button>
      </div>
    </div>
  );
}
