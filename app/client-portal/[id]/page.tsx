"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

function getPropertyPhoto(inspection: any) {
  return (
    inspection?.property_image ||
    inspection?.street_view_url ||
    inspection?.cover_photo_url ||
    inspection?.google_photo_url ||
    inspection?.property_photo_url ||
    inspection?.place_photo_url ||
    inspection?.photo_url ||
    inspection?.image_url ||
    ""
  );
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    0
  );
}

function getAmountPaid(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getBalanceDue(inspection: any) {
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    return getNumber(inspection.balance_due);
  }

  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || "Pending",
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getAmountPaid(inspection);

  return invoiceAmount > 0 && amountPaid >= invoiceAmount;
}

function isAgreementSigned(inspection: any) {
  const status = String(
    inspection?.agreement_status || inspection?.agreement_state || "Pending",
  ).toLowerCase();

  return (
    status === "signed" ||
    status === "complete" ||
    status === "completed" ||
    status === "accepted"
  );
}

function isReportPublished(inspection: any) {
  const reportStatus = String(inspection?.report_status || "").toLowerCase().trim();
  const status = String(inspection?.status || "").toLowerCase().trim();
  const deliveryStatus = String(inspection?.delivery_status || "").toLowerCase().trim();
  const publishStatus = String(inspection?.publish_status || "").toLowerCase().trim();
  const sharedStatus = String(inspection?.shared_status || "").toLowerCase().trim();

  const publishedWords = new Set([
    "published",
    "publish",
    "ready",
    "complete",
    "completed",
    "sent",
    "delivered",
    "shared",
  ]);

  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    Boolean(inspection?.published_at) ||
    Boolean(inspection?.report_published_at) ||
    Boolean(inspection?.sent_at) ||
    publishedWords.has(reportStatus) ||
    publishedWords.has(status) ||
    publishedWords.has(deliveryStatus) ||
    publishedWords.has(publishStatus) ||
    publishedWords.has(sharedStatus)
  );
}

function getReportUnlockMessage({
  agreementSigned,
  paymentComplete,
  reportPublished,
}: {
  agreementSigned: boolean;
  paymentComplete: boolean;
  reportPublished: boolean;
}) {
  if (agreementSigned && paymentComplete && reportPublished) {
    return "Your report is ready to view and download.";
  }

  const missing: string[] = [];

  if (!agreementSigned) missing.push("signed agreement");
  if (!paymentComplete) missing.push("completed payment");
  if (!reportPublished) missing.push("published final report");

  return `Your report will unlock after: ${missing.join(", ")}.`;
}

export default function ClientPortalPage() {
  const params = useParams();
  const inspectionId = params.id as string;

  const [inspection, setInspection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    loadInspection();
  }, [inspectionId]);

  async function loadInspection() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setInspection(data);
    setLoading(false);
  }

  async function updateStatus(field: string, value: string) {
    const res = await fetch("/api/update-client-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionId,
        field,
        value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to update status");
      return;
    }

    await loadInspection();
  }

  async function startStripeCheckout() {
    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    try {
      setPaying(true);

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Unable to start payment.");
        return;
      }

      if (!data.url) {
        alert("Stripe checkout URL was not returned.");
        return;
      }

      window.location.href = data.url;
    } catch (error: any) {
      alert(error?.message || "Unable to start payment.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Loading client portal...
      </main>
    );
  }

  if (!inspection) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Inspection not found.
      </main>
    );
  }

  const propertyPhoto = getPropertyPhoto(inspection);
  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getAmountPaid(inspection);
  const balanceDue = getBalanceDue(inspection);
  const paymentComplete = isPaymentComplete(inspection);
  const agreementSigned = isAgreementSigned(inspection);
  const reportPublished = isReportPublished(inspection);
  const reportUnlocked = agreementSigned && paymentComplete && reportPublished;
  const paymentStatus = paymentComplete
    ? "Paid"
    : inspection.payment_status || inspection.invoice_status || "Pending";
  const agreementStatus = agreementSigned
    ? "Signed"
    : inspection.agreement_status || inspection.agreement_state || "Pending";
  const reportStatus = reportPublished
    ? "Published"
    : inspection.report_status || "Draft";
  const reportUnlockMessage = getReportUnlockMessage({
    agreementSigned,
    paymentComplete,
    reportPublished,
  });

  return (
    <main className="min-h-screen bg-[#020617] p-6 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
          {propertyPhoto && (
            <div className="border-b border-slate-800 bg-black">
              <img
                src={propertyPhoto}
                alt="Property"
                className="h-64 w-full object-cover"
              />
            </div>
          )}

          <div className="p-6">
            <h1 className="text-4xl font-extrabold text-teal-400">
              Client Portal
            </h1>

            <p className="mt-2 text-slate-400">On Point Home Inspections</p>

            <div className="mt-5 flex flex-wrap gap-3">
              {paymentComplete && (
                <span className="rounded-full border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-green-300">
                  Paid in Full
                </span>
              )}

              {agreementSigned && (
                <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-teal-300">
                  Agreement Signed
                </span>
              )}

              {reportPublished ? (
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-cyan-300">
                  Report Published
                </span>
              ) : (
                <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-yellow-300">
                  Report Not Published Yet
                </span>
              )}
            </div>
          </div>
        </div>

        {inspection.report_summary && (
          <div className="rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
            <h2 className="text-2xl font-extrabold text-teal-300">
              Report Summary
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Summary of notable report findings and recommendations.
            </p>

            <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
              {inspection.report_summary}
            </div>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-teal-300">
            Inspection Details
          </h2>

          <p>
            <strong>Property:</strong>{" "}
            {inspection.property_address || inspection.address || "N/A"}
          </p>

          <p>
            <strong>Client:</strong> {inspection.client_name || "N/A"}
          </p>

          <p>
            <strong>Date:</strong> {inspection.inspection_date || "N/A"}
          </p>

          <p>
            <strong>Time:</strong> {inspection.inspection_time || "N/A"}
          </p>

          {inspection.year_built && (
            <p>
              <strong>Year Built:</strong> {inspection.year_built}
            </p>
          )}

          <p>
            <strong>Status:</strong> {reportStatus}
          </p>

          <p>
            <strong>Price:</strong>{" "}
            {inspection.price ? `$${inspection.price}` : "N/A"}
          </p>

          <p>
            <strong>Invoice Amount:</strong>{" "}
            {invoiceAmount ? money(invoiceAmount) : "N/A"}
          </p>

          <p>
            <strong>Amount Paid:</strong> {money(amountPaid)}
          </p>

          <p>
            <strong>Balance Due:</strong> {money(balanceDue)}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PortalCard title="Agreement" status={agreementStatus} />

          <PortalCard
            title="Payment"
            status={paymentComplete ? "Paid" : paymentStatus}
          />

          <PortalCard title="Balance Due" status={money(balanceDue)} />

          <PortalCard title="Report" status={reportStatus} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-teal-300">Payment Summary</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <PaymentBox label="Invoice Amount" value={money(invoiceAmount)} />
            <PaymentBox label="Amount Paid" value={money(amountPaid)} />
            <PaymentBox
              label="Balance Due"
              value={money(balanceDue)}
              highlight={balanceDue > 0 ? "warning" : "success"}
            />
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Secure online payments are processed through Stripe. Once payment is
            complete, this portal will return to On Point Inspect and update the
            payment status.
          </p>
        </div>

        <div
          className={`rounded-2xl border p-6 shadow-xl ${
            reportUnlocked
              ? "border-green-500/40 bg-green-950/20"
              : "border-yellow-500/40 bg-yellow-950/20"
          }`}
        >
          <h2
            className={`text-2xl font-bold ${
              reportUnlocked ? "text-green-300" : "text-yellow-300"
            }`}
          >
            {reportUnlocked ? "Report Ready" : "Report Locked"}
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            {reportUnlockMessage}
          </p>

          {!reportPublished && (
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Payment can be complete before the final report is published. The
              client will only be able to view the report after you publish it.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="mb-6 text-2xl font-bold text-teal-300">
            Client Actions
          </h2>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => updateStatus("agreement_status", "Signed")}
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-slate-950 hover:bg-teal-400"
            >
              Sign Agreement
            </button>

            {paymentComplete || balanceDue <= 0 ? (
              <button
                disabled
                className="cursor-not-allowed rounded-xl bg-green-600 px-6 py-3 font-bold text-white opacity-80"
              >
                Payment Complete
              </button>
            ) : (
              <button
                onClick={startStripeCheckout}
                disabled={paying}
                className="rounded-xl bg-green-500 px-6 py-3 font-bold text-slate-950 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paying
                  ? "Opening Checkout..."
                  : `Pay Now ${money(balanceDue)}`}
              </button>
            )}

            <button
              onClick={() => updateStatus("review_status", "Submitted")}
              className="rounded-xl bg-yellow-500 px-6 py-3 font-bold text-slate-950 hover:bg-yellow-400"
            >
              Leave Review
            </button>

            {reportUnlocked ? (
              <a
                href={`/share/${inspectionId}`}
                target="_blank"
                className="rounded-xl border border-teal-500 bg-[#071224] px-6 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
              >
                View Full Report
              </a>
            ) : (
              <button
                disabled
                title={reportUnlockMessage}
                className="cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 font-bold text-slate-500"
              >
                View Full Report Locked
              </button>
            )}

            {reportUnlocked ? (
              <a
                href={`/reports/${inspectionId}/print`}
                target="_blank"
                className="rounded-xl border border-cyan-500 bg-[#071224] px-6 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
              >
                Download PDF
              </a>
            ) : (
              <button
                disabled
                title={reportUnlockMessage}
                className="cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 font-bold text-slate-500"
              >
                Download PDF Locked
              </button>
            )}

            <a
              href={`/repair-request?inspection_id=${inspectionId}`}
              target="_blank"
              className="rounded-xl border border-orange-500 bg-[#071224] px-6 py-3 font-bold text-orange-300 hover:bg-orange-500/10"
            >
              Repair Request
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function PaymentBox({
  label,
  value,
  highlight = "default",
}: {
  label: string;
  value: string;
  highlight?: "default" | "warning" | "success";
}) {
  const color =
    highlight === "success"
      ? "text-green-400"
      : highlight === "warning"
        ? "text-orange-300"
        : "text-teal-300";

  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function PortalCard({ title, status }: { title: string; status: string }) {
  const green =
    status === "Signed" ||
    status === "Paid" ||
    status === "Waived" ||
    status === "Published" ||
    status === "Submitted" ||
    status === "$0";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
      <p className="text-sm text-slate-400">{title}</p>

      <p
        className={`mt-2 text-xl font-bold ${
          green ? "text-green-400" : "text-teal-400"
        }`}
      >
        {status}
      </p>
    </div>
  );
}
