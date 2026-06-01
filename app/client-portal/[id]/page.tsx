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

const PORTAL_PROCESSING_FEE_DOLLARS = 15;

function getPortalProcessingFee(balanceDue: number) {
  if (!balanceDue || balanceDue <= 0) return 0;

  return PORTAL_PROCESSING_FEE_DOLLARS;
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || "Pending"
  ).toLowerCase();

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getAmountPaid(inspection);
  const balanceDue = getBalanceDue(inspection);
  const portalProcessingFee = getPortalProcessingFee(balanceDue);
  const totalOnlinePayment = balanceDue + portalProcessingFee;

  if (status === "paid") return true;

  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;
  if (amountPaid > 0 && balanceDue <= 0) return true;

  return false;
}

function isAgreementSigned(inspection: any) {
  const agreementStatus = String(
    inspection?.agreement_status ||
      inspection?.agreement_state ||
      inspection?.agreement_signed_status ||
      "Pending"
  ).toLowerCase();

  return (
    agreementStatus === "signed" ||
    agreementStatus === "complete" ||
    agreementStatus === "completed" ||
    agreementStatus === "accepted" ||
    inspection?.agreement_signed === true ||
    inspection?.signed_agreement === true
  );
}

function isReportPublished(inspection: any) {
  const reportStatus = String(inspection?.report_status || "").toLowerCase();
  const status = String(inspection?.status || "").toLowerCase();
  const deliveryStatus = String(
    inspection?.delivery_status || inspection?.report_delivery_status || ""
  ).toLowerCase();

  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    inspection?.report_published === true ||
    reportStatus === "published" ||
    reportStatus === "publish" ||
    reportStatus === "ready" ||
    status === "published" ||
    status === "publish" ||
    status === "ready" ||
    deliveryStatus === "published" ||
    deliveryStatus === "ready"
  );
}

function getReportStatusLabel(inspection: any) {
  if (isReportPublished(inspection)) return "Published";
  return inspection?.report_status || inspection?.status || "Draft";
}

function getServiceType(inspection: any) {
  return String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();
}

function hasMoldService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("mold") || inspection?.mold === true;
}

function hasRadonService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("radon") || inspection?.radon === true;
}

function isStandaloneEnvironmentalService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return (
    serviceType.includes("radon_only") ||
    serviceType.includes("mold_only") ||
    serviceType.includes("radon_mold")
  );
}

function getClientReportHref(inspection: any, inspectionId: string) {
  return isStandaloneEnvironmentalService(inspection)
    ? `/environmental-share/${inspectionId}`
    : `/share/${inspectionId}`;
}

function getClientPdfHref(inspection: any, inspectionId: string) {
  return isStandaloneEnvironmentalService(inspection)
    ? `/environmental-share/${inspectionId}`
    : `/reports/${inspectionId}/print`;
}

export default function ClientPortalPage() {
  const params = useParams();
  const inspectionId = params.id as string;

  const [inspection, setInspection] = useState<any>(null);
  const [moldTest, setMoldTest] = useState<any>(null);
  const [radonTest, setRadonTest] = useState<any>(null);
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

    let moldData = null;
    let radonData = null;

    try {
      const environmentalRes = await fetch(
        `/api/environmental-links?inspection_id=${inspectionId}`,
        {
          cache: "no-store",
        }
      );

      const environmentalData = await environmentalRes.json();

      if (environmentalRes.ok) {
        moldData = environmentalData.mold_test || null;
        radonData = environmentalData.radon_test || null;
      } else {
        console.error(
          "Environmental links load error:",
          environmentalData.error
        );
      }
    } catch (environmentalError) {
      console.error("Could not load environmental links:", environmentalError);
    }

    setInspection(data);
    setMoldTest(moldData);
    setRadonTest(radonData);
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

      const confirmed = window.confirm(
        "Online card payments through the portal include a small processing fee. Other approved payment methods may be available without this online fee. Continue to Stripe checkout?"
      );

      if (!confirmed) {
        return;
      }

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
  const portalProcessingFee = getPortalProcessingFee(balanceDue);
  const totalOnlinePayment = balanceDue + portalProcessingFee;

  const paymentStatus =
    inspection.payment_status || inspection.invoice_status || "Pending";
  const paymentStatusLower = String(paymentStatus).toLowerCase();
  const paymentComplete = isPaymentComplete(inspection);
  const paymentRequirementComplete =
    paymentComplete || paymentStatusLower === "waived";

  const agreementSigned = isAgreementSigned(inspection);
  const reportPublished = isReportPublished(inspection);
  const reportUnlocked =
    agreementSigned && paymentRequirementComplete && reportPublished;

  const agreementStatus =
    inspection.agreement_status || inspection.agreement_state || "Pending";
  const reportStatus = getReportStatusLabel(inspection);

  const propertyAddress =
    inspection.property_address || inspection.address || "Property Address Not Entered";

  const reportHref = getClientReportHref(inspection, inspectionId);
  const pdfHref = getClientPdfHref(inspection, inspectionId);

  const moldReportUrl = moldTest?.lab_report_url || "";
  const radonReportUrl = radonTest?.report_url || "";
  const showEnvironmentalLinks =
    (hasMoldService(inspection) && moldReportUrl) ||
    (hasRadonService(inspection) && radonReportUrl);

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-2xl">
          {propertyPhoto && (
            <div className="relative border-b border-slate-800 bg-black">
              <img
                src={propertyPhoto}
                alt="Property"
                className="h-72 w-full object-cover md:h-96"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent" />
            </div>
          )}

          <div className="p-6 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-400">
              On Point Home Inspections
            </p>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
                  Client Portal
                </h1>

                <p className="mt-3 max-w-3xl text-lg leading-7 text-slate-300">
                  {propertyAddress}
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  Protecting Your Investment. One Inspection at a Time.
                </p>
              </div>

              {reportUnlocked ? (
                <div className="rounded-2xl border border-green-500/40 bg-green-500/10 px-6 py-4 text-center">
                  <p className="text-xs font-black uppercase tracking-wide text-green-300">
                    Report Access
                  </p>
                  <p className="mt-1 text-2xl font-black text-green-300">
                    Unlocked
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-6 py-4 text-center">
                  <p className="text-xs font-black uppercase tracking-wide text-yellow-300">
                    Report Access
                  </p>
                  <p className="mt-1 text-2xl font-black text-yellow-300">
                    Locked
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard
            title="Agreement"
            status={agreementSigned ? "Signed" : agreementStatus}
            complete={agreementSigned}
            completeLabel="Agreement Signed"
            incompleteLabel="Needs Signature"
          />

          <StatusCard
            title="Payment"
            status={paymentComplete ? "Paid" : paymentStatus}
            complete={paymentRequirementComplete}
            completeLabel={
              paymentStatusLower === "waived" ? "Payment Waived" : "Paid In Full"
            }
            incompleteLabel="Payment Required"
          />

          <StatusCard
            title="Report"
            status={reportStatus}
            complete={reportPublished}
            completeLabel="Report Published"
            incompleteLabel="Not Published Yet"
          />
        </section>

        {!reportUnlocked && (
          <section className="rounded-2xl border border-yellow-500/40 bg-yellow-950/20 p-6 shadow-xl">
            <h2 className="text-2xl font-black text-yellow-300">
              Report Access Requirements
            </h2>

            <p className="mt-2 text-slate-300">
              The report will unlock when all requirements below are complete.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <RequirementRow
                complete={agreementSigned}
                label="Agreement Signed"
              />
              <RequirementRow
                complete={paymentRequirementComplete}
                label={
                  paymentStatusLower === "waived"
                    ? "Payment Waived"
                    : "Payment Complete"
                }
              />
              <RequirementRow
                complete={reportPublished}
                label="Report Published by Inspector"
              />
            </div>
          </section>
        )}

        {reportUnlocked && (
          <section className="rounded-2xl border border-green-500/40 bg-green-950/20 p-6 shadow-xl">
            <h2 className="text-2xl font-black text-green-300">
              Your Report Is Ready
            </h2>

            <p className="mt-2 text-slate-300">
              Agreement, payment, and report publishing are complete. You can now view or download your inspection report.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <ActionLink
                href={reportHref}
                title="View Client Report"
                description="Open the online client-friendly report."
                tone="teal"
              />

              <ActionLink
                href={pdfHref}
                title="Download PDF"
                description={
                  isStandaloneEnvironmentalService(inspection)
                    ? "Open the environmental report for printing or saving."
                    : "Open the printable PDF version of the report."
                }
                tone="cyan"
              />

              <ActionLink
                href={`/repair-request?inspection_id=${inspectionId}`}
                title="Repair Request"
                description="View or create the repair request list."
                tone="orange"
              />
            </div>
          </section>
        )}

        {reportUnlocked && showEnvironmentalLinks && (
          <section className="rounded-2xl border border-purple-500/40 bg-purple-950/20 p-6 shadow-xl">
            <h2 className="text-2xl font-black text-purple-300">
              Official Environmental Reports
            </h2>

            <p className="mt-2 text-slate-300">
              These links open the official third-party environmental reports from the lab or testing device.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {hasMoldService(inspection) && moldReportUrl && (
                <ActionLink
                  href={moldReportUrl}
                  title="View Official Mold Report"
                  description="Open the official mold lab report."
                  tone="purple"
                />
              )}

              {hasRadonService(inspection) && radonReportUrl && (
                <ActionLink
                  href={radonReportUrl}
                  title="View Official Radon Report"
                  description="Open the official radon device report."
                  tone="purple"
                />
              )}
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl lg:col-span-2">
            <h2 className="text-2xl font-bold text-teal-300">
              Inspection Details
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label="Property" value={propertyAddress} />
              <Info label="Client" value={inspection.client_name || "N/A"} />
              <Info label="Inspection Date" value={inspection.inspection_date || "N/A"} />
              <Info label="Inspection Time" value={inspection.inspection_time || "N/A"} />
              <Info label="Year Built" value={inspection.year_built || "N/A"} />
              <Info
                label="Square Feet"
                value={inspection.square_feet || inspection.sqft || "N/A"}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
            <h2 className="text-2xl font-bold text-teal-300">
              Payment Summary
            </h2>

            <div className="mt-5 space-y-4">
              <PaymentLine label="Invoice Amount" value={money(invoiceAmount)} />
              <PaymentLine label="Amount Paid" value={money(amountPaid)} />
              <PaymentLine
                label="Balance Due"
                value={money(balanceDue)}
                highlight={balanceDue > 0 ? "warning" : "success"}
              />

              {!paymentRequirementComplete && balanceDue > 0 && (
                <>
                  <PaymentLine
                    label="Online Payment Fee"
                    value={money(portalProcessingFee)}
                    highlight="warning"
                  />

                  <PaymentLine
                    label="Total If Paid Online"
                    value={money(totalOnlinePayment)}
                    highlight="warning"
                  />

                  <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs leading-5 text-yellow-200">
                    Online card payments through the portal include a small processing fee.
                    Other approved payment methods may be available without this online fee.
                  </p>
                </>
              )}
            </div>

            {paymentRequirementComplete || balanceDue <= 0 ? (
              <button
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-xl bg-green-600 px-6 py-3 font-bold text-white opacity-90"
              >
                {paymentStatusLower === "waived"
                  ? "Payment Waived"
                  : "Payment Complete"}
              </button>
            ) : (
              <button
                onClick={startStripeCheckout}
                disabled={paying}
                className="mt-6 w-full rounded-xl bg-green-500 px-6 py-3 font-bold text-slate-950 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paying
                  ? "Opening Checkout..."
                  : `Pay Online ${money(totalOnlinePayment)}`}
              </button>
            )}
          </div>
        </section>

        {inspection.report_summary && (
          <section className="rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
            <h2 className="text-2xl font-extrabold text-teal-300">
              Report Summary
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Summary of notable report findings and recommendations.
            </p>

            <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
              {inspection.report_summary}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-teal-300">
            Client Actions
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => updateStatus("agreement_status", "Signed")}
              disabled={agreementSigned}
              className={`rounded-xl px-6 py-4 text-left font-bold transition ${
                agreementSigned
                  ? "cursor-not-allowed border border-green-500/40 bg-green-500/10 text-green-300"
                  : "bg-teal-500 text-slate-950 hover:bg-teal-400"
              }`}
            >
              <span className="block text-lg">
                {agreementSigned ? "Agreement Signed" : "Sign Agreement"}
              </span>
              <span className="mt-1 block text-sm font-medium opacity-80">
                {agreementSigned
                  ? "This requirement is complete."
                  : "Complete the inspection agreement."}
              </span>
            </button>

            {reportUnlocked ? (
              <>
                <a
                  href={reportHref}
                  target="_blank"
                  className="rounded-xl border border-teal-500 bg-[#071224] px-6 py-4 font-bold text-teal-300 hover:bg-teal-500/10"
                >
                  <span className="block text-lg">View Report</span>
                  <span className="mt-1 block text-sm font-medium text-slate-400">
                    Open the client report.
                  </span>
                </a>

                <a
                  href={pdfHref}
                  target="_blank"
                  className="rounded-xl border border-cyan-500 bg-[#071224] px-6 py-4 font-bold text-cyan-300 hover:bg-cyan-500/10"
                >
                  <span className="block text-lg">Download PDF</span>
                  <span className="mt-1 block text-sm font-medium text-slate-400">
                    Printable report version.
                  </span>
                </a>

                <a
                  href={`/repair-request?inspection_id=${inspectionId}`}
                  target="_blank"
                  className="rounded-xl border border-orange-500 bg-[#071224] px-6 py-4 font-bold text-orange-300 hover:bg-orange-500/10"
                >
                  <span className="block text-lg">Repair Request</span>
                  <span className="mt-1 block text-sm font-medium text-slate-400">
                    Open repair request builder.
                  </span>
                </a>
              </>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-[#020617] px-6 py-4 text-slate-400 md:col-span-3">
                <p className="text-lg font-bold text-white">
                  Report Actions Locked
                </p>
                <p className="mt-1 text-sm">
                  View Report, Download PDF, and Repair Request will appear after the agreement is signed, payment is complete, and the inspector publishes the report.
                </p>
              </div>
            )}

            <button
              onClick={() => updateStatus("review_status", "Submitted")}
              className="rounded-xl border border-yellow-500 bg-[#071224] px-6 py-4 text-left font-bold text-yellow-300 hover:bg-yellow-500/10"
            >
              <span className="block text-lg">Leave Review</span>
              <span className="mt-1 block text-sm font-medium text-slate-400">
                Mark review follow-up submitted.
              </span>
            </button>
          </div>
        </section>

        <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
          On Point Home Inspections LLC • Client Portal
        </footer>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  status,
  complete,
  completeLabel,
  incompleteLabel,
}: {
  title: string;
  status: string;
  complete: boolean;
  completeLabel: string;
  incompleteLabel: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-xl ${
        complete
          ? "border-green-500/40 bg-green-950/20"
          : "border-slate-800 bg-[#0f172a]"
      }`}
    >
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${
          complete ? "text-green-300" : "text-yellow-300"
        }`}
      >
        {complete ? "✓" : "•"} {status}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {complete ? completeLabel : incompleteLabel}
      </p>
    </div>
  );
}

function RequirementRow({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        complete
          ? "border-green-500/40 bg-green-500/10 text-green-300"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
      }`}
    >
      <p className="font-bold">
        {complete ? "✓ Complete" : "• Waiting"}
      </p>
      <p className="mt-1 text-sm text-slate-300">{label}</p>
    </div>
  );
}

function ActionLink({
  href,
  title,
  description,
  tone,
}: {
  href: string;
  title: string;
  description: string;
  tone: "teal" | "cyan" | "orange" | "purple";
}) {
  const classes =
    tone === "teal"
      ? "border-teal-500 text-teal-300 hover:bg-teal-500/10"
      : tone === "cyan"
      ? "border-cyan-500 text-cyan-300 hover:bg-cyan-500/10"
      : tone === "purple"
      ? "border-purple-500 text-purple-300 hover:bg-purple-500/10"
      : "border-orange-500 text-orange-300 hover:bg-orange-500/10";

  return (
    <a
      href={href}
      target="_blank"
      className={`rounded-xl border bg-[#071224] p-5 font-bold transition ${classes}`}
    >
      <span className="block text-lg">{title}</span>
      <span className="mt-2 block text-sm font-medium text-slate-400">
        {description}
      </span>
    </a>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}

function PaymentLine({
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

      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}
