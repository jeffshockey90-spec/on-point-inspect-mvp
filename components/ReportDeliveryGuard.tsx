"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type InspectionPaymentStatus = {
  invoice_status?: string | null;
  payment_status?: string | null;
  invoice_amount?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
  agreement_waived?: boolean | null;
  agreement_waived_at?: string | null;
  agreement_waiver_reason?: string | null;
};

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

function isPaymentComplete(payment: InspectionPaymentStatus | null) {
  if (!payment) return false;

  const status = String(
    payment.payment_status || payment.invoice_status || "Unpaid",
  ).toLowerCase();

  const invoiceAmount = getNumber(payment.invoice_amount);
  const amountPaid = getNumber(payment.amount_paid);

  const storedBalance =
    payment.balance_due !== null && payment.balance_due !== undefined
      ? getNumber(payment.balance_due)
      : Math.max(0, invoiceAmount - amountPaid);

  if (status === "paid" || status === "waived") return true;
  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;

  return storedBalance <= 0 && invoiceAmount > 0;
}

export default function ReportDeliveryGuard({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [payment, setPayment] =
    useState<InspectionPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGuardData() {
      if (!inspectionId) return;

      setLoading(true);

      try {
        const contactsRes = await fetch(
          `/api/inspection-contacts?inspection_id=${inspectionId}`,
          { cache: "no-store" },
        );

        const contactsData = await contactsRes.json().catch(() => ({}));
        setContacts(contactsData.contacts || []);
      } catch (error) {
        console.error("Failed to load agreement guard contacts:", error);
        setContacts([]);
      }

      try {
        const { data, error } = await supabase
          .from("inspections")
          .select(
            "invoice_status, payment_status, invoice_amount, amount_paid, balance_due, agreement_waived, agreement_waived_at, agreement_waiver_reason",
          )
          .eq("id", inspectionId)
          .single();

        if (error) throw error;
        setPayment(data || null);
      } catch (error) {
        console.error("Failed to load payment guard data:", error);
        setPayment(null);
      } finally {
        setLoading(false);
      }
    }

    void loadGuardData();

    function handleWaiverChanged(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      if (
        detail.inspectionId &&
        String(detail.inspectionId) !== String(inspectionId)
      ) {
        return;
      }

      void loadGuardData();
    }

    window.addEventListener(
      "opi:agreement-waiver-changed",
      handleWaiverChanged as EventListener,
    );

    return () => {
      window.removeEventListener(
        "opi:agreement-waiver-changed",
        handleWaiverChanged as EventListener,
      );
    };
  }, [inspectionId]);

  const unsignedRequiredContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.agreement_required && !contact.agreement_signed,
      ),
    [contacts],
  );

  const paymentComplete = isPaymentComplete(payment);
  const agreementWaived = payment?.agreement_waived === true;

  const invoiceAmount = getNumber(payment?.invoice_amount);
  const amountPaid = getNumber(payment?.amount_paid);

  const balanceDue =
    payment?.balance_due !== null && payment?.balance_due !== undefined
      ? getNumber(payment?.balance_due)
      : Math.max(0, invoiceAmount - amountPaid);

  const paymentStatus = String(
    payment?.payment_status || payment?.invoice_status || "Unpaid",
  );

  const hasAgreementBlock =
    !agreementWaived && unsignedRequiredContacts.length > 0;
  const hasPaymentBlock = !paymentComplete;

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-950/40 p-5">
        <p className="font-bold text-slate-300">
          Checking delivery requirements...
        </p>
      </div>
    );
  }

  if (!hasAgreementBlock && !hasPaymentBlock) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-500 bg-emerald-950/20 p-5">
        <h2 className="text-2xl font-extrabold text-emerald-300">
          Delivery Requirements Complete
        </h2>

        <p className="mt-2 text-slate-300">
          {agreementWaived
            ? "The agreement requirement is waived and payment is marked complete or waived. Report delivery is cleared."
            : "Required agreements are signed and payment is marked complete or waived. Report delivery is cleared."}
        </p>

        {agreementWaived && (
          <div className="mt-4 rounded-xl border border-purple-500/50 bg-purple-500/10 p-4">
            <p className="font-black text-purple-300">
              Agreement Requirement Waived
            </p>

            <p className="mt-2 text-sm text-slate-300">
              {payment?.agreement_waiver_reason ||
                "No waiver reason was recorded."}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-yellow-500 bg-yellow-950/20 p-5">
      <h2 className="text-2xl font-extrabold text-yellow-300">
        Delivery Requirements Pending
      </h2>

      <p className="mt-2 text-slate-300">
        Confirm all required agreements are signed or intentionally waived and
        payment is complete before delivering the final report.
      </p>

      {hasAgreementBlock && (
        <div className="mt-5 rounded-xl border border-yellow-500 bg-yellow-950/30 p-4">
          <h3 className="font-black text-yellow-300">
            Agreement Signatures Pending
          </h3>

          <p className="mt-2 text-sm text-slate-300">
            {unsignedRequiredContacts.length} required client signature
            {unsignedRequiredContacts.length === 1 ? "" : "s"} still pending.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {unsignedRequiredContacts.map((contact) => (
              <span
                key={contact.id}
                className="rounded-xl border border-yellow-500 px-3 py-2 text-sm font-bold text-yellow-300"
              >
                {contact.name || contact.email}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasPaymentBlock && (
        <div className="mt-5 rounded-xl border border-orange-500 bg-orange-950/30 p-4">
          <h3 className="font-black text-orange-300">
            Payment Not Complete
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-orange-700 bg-slate-950/60 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Status
              </p>
              <p className="mt-1 text-lg font-black text-orange-300">
                {paymentStatus}
              </p>
            </div>

            <div className="rounded-xl border border-orange-700 bg-slate-950/60 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Amount Paid
              </p>
              <p className="mt-1 text-lg font-black text-orange-300">
                {money(amountPaid)}
              </p>
            </div>

            <div className="rounded-xl border border-orange-700 bg-slate-950/60 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Balance Due
              </p>
              <p className="mt-1 text-lg font-black text-orange-300">
                {money(balanceDue)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-300">
            Use the Invoice / Payment Status panel on this report to mark the
            inspection Paid or Waived when appropriate.
          </p>
        </div>
      )}
    </div>
  );
}
