"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LineItem = { description: string; quantity: number; unitPrice: number };

type Props = {
  initialInvoice?: any;
  inspectionId?: string | null;
};

function money(value: number) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export default function InvoiceBuilder({ initialInvoice, inspectionId }: Props) {
  const router = useRouter();
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
  const [error, setError] = useState("");

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

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
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
      router.push("/invoices");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-white outline-none focus:border-teal-400";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {error && (
        <div className="rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Client name</span>
          <input className={inputClass} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Client email</span>
          <input className={inputClass} type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@email.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Invoice # (optional)</span>
          <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-1001" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Due date</span>
          <input className={inputClass} type="date" value={dueDate || ""} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-[#071224] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-teal-300">Line items</h3>
          <button type="button" onClick={addItem} className="rounded-lg border border-teal-500 px-3 py-1 text-xs font-black text-teal-300 hover:bg-teal-500/10">
            + Add line item
          </button>
        </div>

        <div className="space-y-3">
          {items.map((li, i) => {
            const amount = (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0);
            return (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <label className="col-span-12 sm:col-span-6">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Description</span>
                  <input className={inputClass} value={li.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Home inspection, radon test, etc." />
                </label>
                <label className="col-span-4 sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Qty</span>
                  <input className={inputClass} type="number" min="0" step="1" value={li.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                </label>
                <label className="col-span-4 sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Unit price</span>
                  <input className={inputClass} type="number" min="0" step="0.01" value={li.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} />
                </label>
                <div className="col-span-3 sm:col-span-1 pb-2 text-right font-bold text-white [font-variant-numeric:tabular-nums]">
                  {money(amount)}
                </div>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length <= 1} className="col-span-1 pb-2 text-lg text-slate-400 hover:text-red-300 disabled:opacity-30" aria-label="Remove line item">
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-slate-700 pt-4">
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Total</p>
            <p className="text-3xl font-black text-teal-300 [font-variant-numeric:tabular-nums]">{money(subtotal)}</p>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Notes (optional)</span>
        <textarea className={`${inputClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note, etc." />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-black text-slate-950 transition hover:bg-teal-400 disabled:cursor-wait disabled:opacity-70">
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
        <button type="button" onClick={() => router.push("/invoices")} className="rounded-xl border border-slate-600 px-6 py-3 font-bold text-slate-200 hover:bg-slate-800">
          Cancel
        </button>
        <span className="text-xs text-slate-500">Save the invoice, then use “Send” from the invoice list to email it with an online pay link.</span>
      </div>
    </div>
  );
}
