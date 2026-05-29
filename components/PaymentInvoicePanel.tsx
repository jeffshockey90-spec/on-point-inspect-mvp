"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type InspectionRecord = Record<string, any>;

const PAYMENT_STATUSES = ["Unpaid", "Paid", "Partial", "Waived"];
const PAYMENT_METHODS = ["", "Cash", "Check", "Card", "ACH", "Zelle", "Venmo", "Other"];

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getInitialInvoiceAmount(inspection: InspectionRecord) {
  return (
    getNumber(inspection.invoice_amount) ||
    getNumber(inspection.total_price) ||
    getNumber(inspection.total) ||
    getNumber(inspection.price) ||
    getNumber(inspection.inspection_price) ||
    getNumber(inspection.inspection_fee) ||
    0
  );
}

export default function PaymentInvoicePanel({
  inspection,
}: {
  inspection: InspectionRecord;
}) {
  const inspectionId = String(inspection?.id || "");

  const [paymentStatus, setPaymentStatus] = useState(
    inspection.payment_status || inspection.invoice_status || "Unpaid"
  );

  const [invoiceAmount, setInvoiceAmount] = useState(
    String(getInitialInvoiceAmount(inspection) || "")
  );

  const [amountPaid, setAmountPaid] = useState(
    inspection.amount_paid !== null && inspection.amount_paid !== undefined
      ? String(inspection.amount_paid)
      : ""
  );

  const [paymentMethod, setPaymentMethod] = useState(
    inspection.payment_method || ""
  );

  const [invoiceDueDate, setInvoiceDueDate] = useState(
    inspection.invoice_due_date || ""
  );

  const [paymentNotes, setPaymentNotes] = useState(
    inspection.payment_notes || inspection.invoice_notes || ""
  );

  const [saving, setSaving] = useState(false);

  const invoiceAmountNumber = useMemo(
    () => getNumber(invoiceAmount),
    [invoiceAmount]
  );

  const amountPaidNumber = useMemo(
    () => getNumber(amountPaid),
    [amountPaid]
  );

  const balanceDue = Math.max(0, invoiceAmountNumber - amountPaidNumber);

  const isPaid =
    paymentStatus === "Paid" ||
    paymentStatus === "Waived" ||
    balanceDue <= 0;

  async function savePaymentStatus() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setSaving(true);

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
          paid_at:
            paymentStatus === "Paid" || paymentStatus === "Waived"
              ? new Date().toISOString()
              : null,
        })
        .eq("id", inspectionId);

      if (error) throw error;

      alert("Payment status saved.");
      window.location.reload();
    } catch (error: any) {
      alert(error?.message || "Failed to save payment status.");
    } finally {
      setSaving(false);
    }
  }

  function markPaid() {
    setPaymentStatus("Paid");
    setAmountPaid(String(invoiceAmountNumber || amountPaidNumber || 0));
  }

  function markUnpaid() {
    setPaymentStatus("Unpaid");
    setAmountPaid("");
  }

  function markWaived() {
    setPaymentStatus("Waived");
    setAmountPaid("0");
  }

  return (
    <section
      className={`mb-8 rounded-2xl border p-5 ${
        isPaid
          ? "border-emerald-600 bg-emerald-950/20"
          : "border-orange-600 bg-orange-950/20"
      }`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            className={`text-2xl font-black ${
              isPaid ? "text-emerald-300" : "text-orange-300"
            }`}
          >
            Invoice / Payment Status
          </h2>

          <p className="mt-2 text-sm text-slate-300">
            Track whether this inspection has been paid before final delivery.
            Stripe checkout can be added after this manual workflow is verified.
          </p>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-right ${
            isPaid
              ? "border-emerald-500 bg-emerald-950/40"
              : "border-orange-500 bg-orange-950/40"
          }`}
        >
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Balance Due
          </p>

          <p
            className={`text-3xl font-black ${
              isPaid ? "text-emerald-300" : "text-orange-300"
            }`}
          >
            {money(balanceDue)}
          </p>
        </div>
      </div>

      {!isPaid && (
        <div className="mb-5 rounded-xl border border-orange-500 bg-orange-950/30 p-4">
          <p className="font-bold text-orange-200">
            Payment is not marked complete. Confirm payment before final report
            delivery unless payment is waived.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Payment Status
          </p>

          <select
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          >
            {PAYMENT_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Invoice Amount
          </p>

          <input
            type="number"
            value={invoiceAmount}
            onChange={(event) => setInvoiceAmount(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>

        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Amount Paid
          </p>

          <input
            type="number"
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>

        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Due Date
          </p>

          <input
            type="date"
            value={invoiceDueDate}
            onChange={(event) => setInvoiceDueDate(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Payment Method
          </p>

          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method || "Not selected"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
            Notes
          </p>

          <input
            value={paymentNotes}
            onChange={(event) => setPaymentNotes(event.target.value)}
            placeholder="Example: paid by check, invoice sent, waived, etc."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={markPaid}
          className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-slate-950 hover:bg-emerald-400"
        >
          Mark Paid
        </button>

        <button
          type="button"
          onClick={markUnpaid}
          className="rounded-xl border border-orange-500 px-5 py-3 font-bold text-orange-300 hover:bg-orange-500/10"
        >
          Mark Unpaid
        </button>

        <button
          type="button"
          onClick={markWaived}
          className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
        >
          Waive Payment
        </button>

        <button
          type="button"
          onClick={savePaymentStatus}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-6 py-3 font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Payment Status"}
        </button>
      </div>
    </section>
  );
}
