"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FastLinkButton from "../../../components/FastLinkButton";
import { getInspectionShareToken } from "../../../lib/shareToken";

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

function normalizeSection(section: string | null | undefined) {
  if (!section) return "Inspection Details";

  const clean = section.trim();

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getChecklistDedupeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getChecklistRowValue(row: any) {
  const raw = row?.item_label ?? row?.item ?? row?.value ?? "";
  return String(raw ?? "").trim();
}

function isChecklistTextPlaceholder(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

  return (
    normalized === "__text_value__" ||
    normalized === "text_value" ||
    /^_+text_value_+$/i.test(value)
  );
}

function isEmptyChecklistValue(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

  return (
    !normalized ||
    normalized === "null" ||
    normalized === "undefined"
  );
}

function isChecklistUnit(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

  return new Set([
    "gallon",
    "gallons",
    "fahrenheit",
    "fahrenheit (f)",
    "celsius",
    "celsius (c)",
    "seer",
  ]).has(normalized);
}

function buildChecklistDisplayValues(rows: any[]) {
  const textRow = (rows || []).find((row: any) =>
    isChecklistTextPlaceholder(getChecklistRowValue(row))
  );

  const customText = String(textRow?.custom_text ?? "").trim();

  const regularValues = (rows || [])
    .filter((row: any) => !isChecklistTextPlaceholder(getChecklistRowValue(row)))
    .map((row: any) => {
      const rawValue = getChecklistRowValue(row);

      if (rawValue.toUpperCase() === "OTHER") {
        return String(row?.custom_text ?? "").trim();
      }

      return rawValue;
    })
    .filter((value: string) => !isEmptyChecklistValue(value));

  const unit = regularValues.find((value: string) => isChecklistUnit(value));
  const values: string[] = [];

  if (customText) {
    const shouldAppendUnit =
      unit &&
      !["n/a", "na", "not applicable"].includes(customText.toLowerCase());

    values.push(shouldAppendUnit ? `${customText} ${unit}` : customText);
  }

  regularValues.forEach((value: string) => {
    if (customText && unit && value === unit) return;
    values.push(value);
  });

  const seen = new Set<string>();

  return values.filter((value) => {
    const key = getChecklistDedupeKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupChecklistRows(rows: any[]) {
  const rowGroups: Record<string, Record<string, any[]>> = {};

  (rows || []).forEach((row: any) => {
    const section = normalizeSection(row.section);
    const groupTitle = String(row.group_title || row.group || "General").trim() || "General";

    if (!rowGroups[section]) rowGroups[section] = {};
    if (!rowGroups[section][groupTitle]) rowGroups[section][groupTitle] = [];

    rowGroups[section][groupTitle].push(row);
  });

  const grouped: Record<string, Record<string, string[]>> = {};

  Object.entries(rowGroups).forEach(([section, groups]) => {
    Object.entries(groups).forEach(([groupTitle, groupRows]) => {
      const values = buildChecklistDisplayValues(groupRows);

      if (!values.length) return;

      if (!grouped[section]) grouped[section] = {};
      grouped[section][groupTitle] = values;
    });
  });

  return grouped;
}

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

const PORTAL_PROCESSING_FEE_PERCENT = 3.95;

function getPortalProcessingFee(balanceDue: number) {
  if (!balanceDue || balanceDue <= 0) return 0;

  return Number(
    (balanceDue * (PORTAL_PROCESSING_FEE_PERCENT / 100)).toFixed(2),
  );
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || "Pending"
  ).toLowerCase();

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getAmountPaid(inspection);
  const balanceDue = getBalanceDue(inspection);

  if (status === "paid" || status === "waived") return true;

  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;
  if (amountPaid > 0 && balanceDue <= 0) return true;

  return false;
}

function isAgreementWaived(inspection: any) {
  return inspection?.agreement_waived === true;
}

function isAgreementSigned(inspection: any) {
  if (isAgreementWaived(inspection)) return true;

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
  const token = getInspectionShareToken(inspection) || inspectionId;

  return isStandaloneEnvironmentalService(inspection)
    ? `/environmental-share/${token}`
    : `/share/${token}`;
}

function getClientPdfHref(inspection: any, inspectionId: string) {
  const token = getInspectionShareToken(inspection) || inspectionId;

  return isStandaloneEnvironmentalService(inspection)
    ? `/environmental-share/${token}`
    : `/reports/${token}/print`;
}

export default function ClientPortalPage() {
  const params = useParams();
  const router = useRouter();
  const shareLookup = params.id as string;

  const [inspection, setInspection] = useState<any>(null);
  const [companyBranding, setCompanyBranding] = useState<{ name: string } | null>(null);
  // The real numeric inspections.id, resolved from shareLookup (which may be
  // a share token or, for older links, the raw numeric id). Every query for
  // this inspection's related data must use this, not the raw URL param.
  const [inspectionId, setInspectionId] = useState("");
  const [moldTest, setMoldTest] = useState<any>(null);
  const [radonTest, setRadonTest] = useState<any>(null);
  const [checklistRows, setChecklistRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [updatingReview, setUpdatingReview] = useState(false);
  const [propertyPhotoFailed, setPropertyPhotoFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    loadInspection();
  }, [shareLookup]);

  useEffect(() => {
    async function trackClientPortalView() {
      if (!inspectionId) return;

      try {
        await fetch("/api/track-inspection-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: inspectionId,
            view_type: "client_portal",
            viewer_role: "client",
            path: `/client-portal/${shareLookup}`,
          }),
        });
      } catch (error) {
        console.error("Client portal view tracking error:", error);
      }
    }

    const timer = window.setTimeout(() => {
      trackClientPortalView();
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inspectionId, shareLookup]);

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function loadInspection() {
    if (!shareLookup) return;

    setLoading(true);
    setLoadFailed(false);

    try {
      const res = await fetch(
        `/api/client-portal-data?lookup=${encodeURIComponent(shareLookup)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.inspection) {
        console.error(data?.error || "Failed to load client portal data.");
        setInspection(null);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      setInspectionId(String(data.inspection.id));
      setInspection(data.inspection);
      setCompanyBranding(data.companyBranding || null);
      setMoldTest(data.moldTest || null);
      setRadonTest(data.radonTest || null);
      setChecklistRows(data.checklistRows || []);
    } catch (error) {
      console.error("Client portal load error:", error);
      setInspection(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(field: string, value: string) {
    if (updatingReview) return;

    setUpdatingReview(true);
    setMessage("");
    setMessageType("");

    try {
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showMessage("error", data.error || "Failed to update status.");
        return;
      }

      showMessage("success", "Review follow-up marked as submitted.");
      await loadInspection();
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to update status.");
    } finally {
      setUpdatingReview(false);
    }
  }

  async function startStripeCheckout() {
    if (paying) return;

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    try {
      setPaying(true);
      setMessage("");
      setMessageType("");

      const confirmed = window.confirm(
        "Online card payments through the portal include a small processing fee. Other approved payment methods may be available without this online fee. Continue to Stripe checkout?"
      );

      if (!confirmed) {
        setPaying(false);
        return;
      }

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          shareToken: shareLookup,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showMessage("error", data.error || "Unable to start payment.");
        return;
      }

      if (!data.url) {
        showMessage("error", "Stripe checkout URL was not returned.");
        return;
      }

      window.location.href = data.url;
    } catch (error: any) {
      showMessage("error", error?.message || "Unable to start payment.");
    } finally {
      setPaying(false);
    }
  }

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(`/reports/${inspectionId}`);
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#020617] px-6 text-center text-white">
        <p>
          {loadFailed
            ? "Couldn't load this report link. This may be a temporary connection issue, or the link may be invalid or expired."
            : "Inspection not found."}
        </p>
        {loadFailed && (
          <button
            type="button"
            onClick={loadInspection}
            className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
          >
            Try Again
          </button>
        )}
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
  const agreementWaived = isAgreementWaived(inspection);
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

  const checklistBySection = groupChecklistRows(checklistRows);
  const checklistSections = SECTION_ORDER.filter(
    (section) => checklistBySection[section]
  );

  return (
    <main className="min-h-screen bg-[#020617] px-4 pb-6 pt-4 text-white md:px-8 md:pb-8">
      <div className="mx-auto max-w-[80rem] space-y-6">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-[#0f172a] px-4 py-2 font-bold text-slate-100 transition active:scale-[0.98] hover:border-teal-500 hover:text-teal-300 [touch-action:manipulation]"
          aria-label="Go back"
        >
          <span aria-hidden="true">←</span> Back
        </button>
        {message && (
          <div
            className={`rounded-2xl border p-4 text-sm font-bold shadow-xl ${
              messageType === "success"
                ? "border-green-500/40 bg-green-950/30 text-green-300"
                : "border-red-500/40 bg-red-950/30 text-red-300"
            }`}
          >
            {message}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-2xl">
          {propertyPhoto && !propertyPhotoFailed && (
            <div className="relative border-b border-slate-800 bg-black">
              <img
                src={propertyPhoto}
                alt="Property"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={() => setPropertyPhotoFailed(true)}
                className="h-72 w-full object-cover md:h-96"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent" />
            </div>
          )}

          <div className="p-6 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-400">
              {companyBranding?.name || "Your Home Inspection Company"}
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
            status={agreementSigned ? (agreementWaived ? "Waived" : "Signed") : agreementStatus}
            complete={agreementSigned}
            completeLabel={agreementWaived ? "Agreement Waived" : "Agreement Signed"}
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
                label={agreementWaived ? "Agreement Waived" : "Agreement Signed"}
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
                href={`/repair-request?inspection_id=${inspectionId}&token=${shareLookup}`}
                title="Repair Request"
                description="View or create the repair request list."
                tone="orange"
              />
            </div>
          </section>
        )}

        {reportUnlocked && inspection.executive_summary && (
          <section className="rounded-2xl border border-purple-500/40 bg-purple-950/20 p-6 shadow-xl">
            <h2 className="text-2xl font-black text-purple-300">
              Executive Summary
            </h2>

            <p className="mt-2 text-slate-300">
              This client-friendly overview summarizes the report findings in plain language.
            </p>

            <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-sm leading-7 text-slate-100">
              {inspection.executive_summary}
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
              {inspection.client_organization_name && (
                <Info label="Business/Organization" value={inspection.client_organization_name} />
              )}
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
                type="button"
                onClick={startStripeCheckout}
                disabled={paying}
                aria-busy={paying}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 font-bold text-slate-950 transition active:scale-[0.98] hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
              >
                {paying && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {paying
                  ? "Opening Checkout..."
                  : `Pay Online ${money(totalOnlinePayment)}`}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-teal-300">
            Client Actions
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {agreementSigned ? (
              agreementWaived ? (
                <div className="rounded-xl border border-green-500/40 bg-green-500/10 px-6 py-4 text-left font-bold text-green-300">
                  <span className="block text-lg">Agreement Waived</span>
                  <span className="mt-1 block text-sm font-medium opacity-80">
                    This requirement is complete.
                  </span>
                </div>
              ) : (
                <FastLinkButton
                  href={`/client-agreement/${shareLookup}`}
                  loadingText="Opening Signed Agreement..."
                  className="rounded-xl border border-green-500/50 bg-green-500/10 px-6 py-4 text-left font-bold text-green-300 hover:bg-green-500/20"
                >
                  <span>
                    <span className="block text-lg">✓ Agreement Signed</span>
                    <span className="mt-1 block text-sm font-medium opacity-80">
                      View or download your signed copy.
                    </span>
                  </span>
                </FastLinkButton>
              )
            ) : (
              <FastLinkButton
                href={`/client-agreement/${shareLookup}`}
                loadingText="Opening Agreement..."
                className="rounded-xl bg-teal-500 px-6 py-4 text-left font-bold text-slate-950 hover:bg-teal-400"
              >
                <span>
                  <span className="block text-lg">Sign Agreement</span>
                  <span className="mt-1 block text-sm font-medium opacity-80">
                    Open and sign the inspection agreement.
                  </span>
                </span>
              </FastLinkButton>
            )}

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
                  href={`/repair-request?inspection_id=${inspectionId}&token=${shareLookup}`}
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
              type="button"
              onClick={() => updateStatus("review_status", "Submitted")}
              disabled={updatingReview}
              aria-busy={updatingReview}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-yellow-500 bg-[#071224] px-6 py-4 text-left font-bold text-yellow-300 transition active:scale-[0.98] hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {updatingReview && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              <span>
                <span className="block text-lg">
                  {updatingReview ? "Saving Review..." : "Leave Review"}
                </span>
                <span className="mt-1 block text-sm font-medium text-slate-400">
                  Mark review follow-up submitted.
                </span>
              </span>
            </button>
          </div>
        </section>

        {checklistSections.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
            <h2 className="text-2xl font-bold text-teal-300">
              Inspection Components
            </h2>

            <div className="mt-6 space-y-5">
              {checklistSections.map((section) => (
                <div
                  key={section}
                  className="rounded-xl border border-slate-800 bg-[#020817]/70 p-5"
                >
                  <h3 className="text-xl font-black text-white">{section}</h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {Object.entries(checklistBySection[section]).map(
                      ([groupTitle, values]) => (
                        <div
                          key={groupTitle}
                          className="rounded-xl border border-slate-700 bg-[#071224] p-4"
                        >
                          <p className="font-black text-teal-300">
                            {groupTitle}
                          </p>

                          <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            {(values as string[]).map((value) => (
                              <li key={`${groupTitle}-${getChecklistDedupeKey(value)}`}>
                                ✓ {value}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
          {companyBranding?.name || "Your Home Inspection Company"} • Client Portal
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

  const isExternal =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:");

  const content = (
    <span>
      <span className="block text-lg">{title}</span>
      <span className="mt-2 block text-sm font-medium text-slate-400">
        {description}
      </span>
    </span>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`rounded-xl border bg-[#071224] p-5 font-bold transition active:scale-[0.98] [touch-action:manipulation] ${classes}`}
      >
        {content}
      </a>
    );
  }

  return (
    <FastLinkButton
      href={href}
      loadingText="Opening..."
      className={`rounded-xl border bg-[#071224] p-5 font-bold ${classes}`}
    >
      {content}
    </FastLinkButton>
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
