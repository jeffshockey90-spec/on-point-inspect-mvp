"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatMoney } from "../lib/locale";

type InspectionRecord = Record<string, any>;

const PAYMENT_STATUSES = ["Unpaid", "Paid", "Partial", "Waived"];
const PAYMENT_METHODS = ["", "Cash", "Check", "Card", "ACH", "Zelle", "Venmo", "Other"];

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getInitialInvoiceAmount(inspection: InspectionRecord) {
  return getNumber(inspection.invoice_amount) || getNumber(inspection.total_price) || getNumber(inspection.total) || getNumber(inspection.price) || getNumber(inspection.inspection_price) || getNumber(inspection.inspection_fee) || 0;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "orange" | "yellow" | "slate" }) {
  const classes =
    tone === "green"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tone === "orange"
        ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
        : tone === "yellow"
          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-300"
          : "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]";
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${classes}`}>{children}</span>;
}

export default function PaymentInvoicePanel({
  inspection,
  currency = "USD",
}: {
  inspection: InspectionRecord;
  currency?: string;
}) {
  const router = useRouter();
  const inspectionId = String(inspection?.id || "");
  const money = (value: number) => formatMoney(value, currency);

  const [paymentStatus, setPaymentStatus] = useState(inspection.payment_status || inspection.invoice_status || "Unpaid");
  const [invoiceAmount, setInvoiceAmount] = useState(String(getInitialInvoiceAmount(inspection) || ""));
  const [amountPaid, setAmountPaid] = useState(inspection.amount_paid !== null && inspection.amount_paid !== undefined ? String(inspection.amount_paid) : "");
  const [paymentMethod, setPaymentMethod] = useState(inspection.payment_method || "");
  const [invoiceDueDate, setInvoiceDueDate] = useState(inspection.invoice_due_date || "");
  const [paymentNotes, setPaymentNotes] = useState(inspection.payment_notes || inspection.invoice_notes || "");
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save Payment Status");
  const [expanded, setExpanded] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const busy = saving || isRefreshing;
  const invoiceAmountNumber = useMemo(() => getNumber(invoiceAmount), [invoiceAmount]);
  const amountPaidNumber = useMemo(() => getNumber(amountPaid), [amountPaid]);
  const balanceDue = Math.max(0, invoiceAmountNumber - amountPaidNumber);
  const isPaid = paymentStatus === "Paid" || paymentStatus === "Waived" || balanceDue <= 0;
  const isPartial = !isPaid && amountPaidNumber > 0;

  async function savePaymentStatus() {
    if (busy) return;
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }
    setSaving(true);
    setSaveLabel("Saving...");
    try {
      const { error } = await supabase
        .from("inspections")
        .update({
          invoice_status: paymentStatus,
          payment_status: paymentStatus,
          invoice_amount: invoiceAmountNumber || null,
          amount_paid: amountPaidNumber || 0,
          balance_due: balanceDue,
          payment_method: paymentMethod || null,
          invoice_due_date: invoiceDueDate || null,
          payment_notes: paymentNotes || null,
          invoice_notes: paymentNotes || null,
          paid_at: paymentStatus === "Paid" || paymentStatus === "Waived" ? new Date().toISOString() : null,
        })
        .eq("id", inspectionId);
      if (error) throw error;
      setSaveLabel("Saved!");
      startTransition(() => router.refresh());
      window.setTimeout(() => setSaveLabel("Save Payment Status"), 1100);
    } catch (error: any) {
      setSaveLabel("Failed");
      alert(error?.message || "Failed to save payment status.");
      window.setTimeout(() => setSaveLabel("Save Payment Status"), 1100);
    } finally {
      setSaving(false);
    }
  }

  function markPaid() {
    if (busy) return;
    setPaymentStatus("Paid");
    setAmountPaid(String(invoiceAmountNumber || amountPaidNumber || 0));
    setSaveLabel("Save Payment Status");
  }
  function markUnpaid() {
    if (busy) return;
    setPaymentStatus("Unpaid");
    setAmountPaid("");
    setSaveLabel("Save Payment Status");
  }
  function markWaived() {
    if (busy) return;
    setPaymentStatus("Waived");
    setAmountPaid("0");
    setSaveLabel("Save Payment Status");
  }

  const fieldClass = "box-border w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className={`mb-6 w-full max-w-full overflow-hidden rounded-2xl border shadow-2xl shadow-black/20 ${isPaid ? "border-emerald-600/70 bg-emerald-950/20" : "border-orange-600/70 bg-orange-950/20"}`}>
      <div className="border-b border-[var(--fl-raised)] bg-gradient-to-r from-[var(--fl-surface)] via-[#0b1628] to-[var(--fl-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fl-accent-text)]">Invoice / Payment</p>
            <h2 className={`mt-2 text-2xl font-semibold ${isPaid ? "text-emerald-300" : "text-orange-300"}`}>{isPaid ? "Payment Complete" : "Payment Required"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={isPaid ? "green" : isPartial ? "yellow" : "orange"}>{paymentStatus}</Badge>
              <Badge tone="slate">Invoice {money(invoiceAmountNumber)}</Badge>
              <Badge tone="slate">Paid {money(amountPaidNumber)}</Badge>
              <Badge tone={isPaid ? "green" : "orange"}>Due {money(balanceDue)}</Badge>
            </div>
          </div>

          <button type="button" onClick={() => setExpanded((current) => !current)} className="w-full rounded-2xl border border-[var(--fl-line)] px-5 py-3 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] sm:w-auto">
            {expanded ? "Hide Details" : "Edit Payment"}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {!isPaid && (
          <div className="mb-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4 text-sm font-bold leading-6 text-orange-200">
            Payment is not marked complete. Confirm payment before final report delivery unless payment is waived.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Invoice</p>
            <p className="mt-1 text-xl font-semibold text-[var(--fl-text)]">{money(invoiceAmountNumber)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Paid</p>
            <p className="mt-1 text-xl font-semibold text-emerald-300">{money(amountPaidNumber)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Due</p>
            <p className={`mt-1 text-xl font-semibold ${isPaid ? "text-emerald-300" : "text-orange-300"}`}>{money(balanceDue)}</p>
          </div>
        </div>

        {expanded && (
          <div className="mt-5 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Payment Status</p><select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} disabled={busy} className={fieldClass}>{PAYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Invoice Amount</p><input type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} disabled={busy} className={fieldClass} /></label>
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Amount Paid</p><input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} disabled={busy} className={fieldClass} /></label>
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Due Date</p><input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} disabled={busy} className={fieldClass} /></label>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Payment Method</p><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={busy} className={fieldClass}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method || "Not selected"}</option>)}</select></label>
              <label><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Notes</p><input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Example: paid by check, waived, etc." disabled={busy} className={fieldClass} /></label>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <button type="button" onClick={markPaid} disabled={busy} className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-emerald-400 disabled:opacity-50 [touch-action:manipulation]">Mark Paid</button>
          <button type="button" onClick={markUnpaid} disabled={busy} className="inline-flex items-center justify-center rounded-xl border border-orange-500 px-5 py-3 font-bold text-orange-300 transition active:scale-[0.98] hover:bg-orange-500/10 disabled:opacity-50 [touch-action:manipulation]">Mark Unpaid</button>
          <button type="button" onClick={markWaived} disabled={busy} className="inline-flex items-center justify-center rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition active:scale-[0.98] hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]">Waive</button>
          <button type="button" onClick={savePaymentStatus} disabled={busy} aria-busy={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:opacity-50 [touch-action:manipulation]">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {isRefreshing ? "Updating..." : saveLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
