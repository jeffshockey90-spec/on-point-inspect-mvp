
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import PrintButton from "../../../components/PrintButton";
import { getCompanyBrandingById } from "../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

type PageProps = {
  params: Promise<{ id: string }>;
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

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value: any) {
  if (!value) return "N/A";

  // A bare "YYYY-MM-DD" has no time/zone; parsing with new Date() reads it as
  // UTC midnight and can render as the previous day. Anchor at UTC noon.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function hasRadonService(inspection: any) {
  const raw = String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return raw.includes("radon") || inspection?.radon === true;
}

function hasMoldService(inspection: any) {
  const raw = String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return raw.includes("mold") || inspection?.mold === true;
}

function getReportTitle(inspection: any) {
  const radon = hasRadonService(inspection);
  const mold = hasMoldService(inspection);

  if (radon && mold) return "Environmental Testing Report";
  if (radon) return "Radon Testing Report";
  if (mold) return "Mold Sampling Report";

  return "Environmental Testing Report";
}

function classifyRadon(average: any) {
  const value = getNumber(average);

  if (!value) return "Pending";
  if (value >= 4) return "Action Recommended";
  if (value >= 2) return "Monitor";

  return "Low";
}

function radonSummary(average: any) {
  const value = getNumber(average);

  if (!value) return "Radon test results have not been entered yet.";

  if (value >= 4) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is at or above the EPA action level of 4.0 pCi/L. Mitigation by a qualified radon contractor is recommended.`;
  }

  if (value >= 2) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L but above 2.0 pCi/L. Continued monitoring or consultation may be considered.`;
  }

  return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L.`;
}

function moldSummary(test: any, inspection: any) {
  const airSamples =
    getNumber(test?.air_samples) || getNumber(inspection?.mold_air_samples);
  const surfaceSamples =
    getNumber(test?.surface_samples) ||
    getNumber(inspection?.mold_surface_samples);
  const result = String(test?.result || "Pending");
  const labStatus = String(test?.lab_status || "Pending Collection");
  const findings = String(test?.findings || "");

  const sampleParts = [];

  if (airSamples > 0) {
    sampleParts.push(`${airSamples} air sample${airSamples === 1 ? "" : "s"}`);
  }

  if (surfaceSamples > 0) {
    sampleParts.push(
      `${surfaceSamples} surface/tape/swab sample${
        surfaceSamples === 1 ? "" : "s"
      }`
    );
  }

  const sampleText =
    sampleParts.length > 0 ? sampleParts.join(" and ") : "mold samples";

  if (result === "Action Recommended") {
    return `Mold sampling was performed with ${sampleText}. The lab results or observations indicate elevated or concerning conditions. Further evaluation and/or remediation by a qualified mold remediation contractor is recommended.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  if (result === "Normal") {
    return `Mold sampling was performed with ${sampleText}. The lab results did not indicate elevated mold conditions at the sampled locations at the time of testing.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  return `Mold sampling was performed with ${sampleText}. Current lab status: ${labStatus}. Final laboratory results are pending or have not been entered yet.${
    findings ? ` Notes: ${findings}` : ""
  }`;
}

function resultClass(result: string) {
  const clean = String(result || "").toLowerCase();

  if (clean.includes("action") || clean.includes("elevated")) {
    return "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]";
  }

  if (clean.includes("monitor") || clean.includes("pending")) {
    return "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  }

  return "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]";
}

export default async function EnvironmentalReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq(accessFilter.column, accessFilter.value)
    .single();

  if (inspectionError || !inspection) redirect("/reports");

  const branding = await getCompanyBrandingById(inspection.company_id);

  const { data: radonTest } = await supabase
    .from("radon_tests")
    .select("*")
    .eq("inspection_id", inspection.id)
    .maybeSingle();

  const { data: moldTest } = await supabase
    .from("mold_tests")
    .select("*")
    .eq("inspection_id", inspection.id)
    .maybeSingle();

  const reportTitle = getReportTitle(inspection);
  const propertyPhoto = getPropertyPhoto(inspection);
  const address =
    inspection.property_address ||
    inspection.address ||
    "Property Address Not Entered";

  const showRadon = hasRadonService(inspection);
  const showMold = hasMoldService(inspection);

  const radonResult = radonTest?.result || classifyRadon(radonTest?.average_pci);
  const moldResult = moldTest?.result || "Pending";

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] print:bg-white print:p-0 print:text-slate-950 md:p-8">
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }

          .print-hide {
            display: none !important;
          }

          .page-break {
            page-break-before: always;
          }

          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] shadow-2xl print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="print-hide flex flex-wrap gap-3 border-b border-[var(--fl-raised)] bg-[var(--fl-ground)] p-5">
          <PrintButton
            label="Print / Save PDF"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-slate-200"
          />

          <Link
            href={`/environmental-share/${inspection.id}`}
            className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-[var(--fl-info-text)] hover:bg-cyan-500/10"
          >
            Public Environmental Report
          </Link>

          <Link
            href={`/reports/${inspection.id}`}
            className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
          >
            Back to Editable Report
          </Link>
        </div>

        <section className="avoid-break overflow-hidden bg-[var(--fl-ground)] print:bg-white">
          {propertyPhoto && (
            <img
              src={propertyPhoto}
              alt="Property"
              className="h-80 w-full object-cover print:h-64"
            />
          )}

          <div className="bg-[var(--fl-ground)] p-8 text-[var(--fl-text)] print:bg-[var(--fl-ground)]">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fl-accent-text)]">
              {branding.name}
            </p>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight">
              {reportTitle}
            </h1>

            <p className="mt-3 text-lg font-semibold text-[var(--fl-muted)]">
              {address}
            </p>

            <p className="mt-2 text-sm text-[var(--fl-muted)]">
              Protecting Your Investment. One Inspection at a Time.
            </p>
          </div>

          <div className="grid gap-5 bg-white p-8 text-slate-950 md:grid-cols-2">
            <Info label="Property Address" value={address} />
            <Info label="Client" value={inspection.client_name} />
            <Info label="Client Email" value={inspection.client_email} />
            <Info label="Inspection Date" value={formatDate(inspection.inspection_date)} />
            <Info label="Inspection Time" value={inspection.inspection_time} />
            <Info label="Service Type" value={inspection.inspection_type || inspection.services} />
          </div>
        </section>

        {showRadon && (
          <section className="avoid-break page-break bg-white p-8 text-slate-950">
            <div className="rounded-2xl border border-slate-300 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                    Radon Testing Results
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                    Radon Summary
                  </h2>
                </div>

                <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${resultClass(radonResult)}`}>
                  {radonResult}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Info label="Average pCi/L" value={radonTest?.average_pci ?? "Pending"} />
                <Info label="Highest pCi/L" value={radonTest?.highest_pci ?? "N/A"} />
                <Info label="Lowest pCi/L" value={radonTest?.lowest_pci ?? "N/A"} />
                <Info label="Start Time" value={formatDateTime(radonTest?.start_time)} />
                <Info label="End Time" value={formatDateTime(radonTest?.end_time)} />
                <Info label="EPA Action Level" value="4.0 pCi/L" />
                <Info label="Device Name" value={radonTest?.device_name || "N/A"} />
                <Info label="Serial Number" value={radonTest?.serial_number || "N/A"} />
              </div>

              <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-5">
                <h3 className="text-xl font-semibold text-slate-950">
                  Client Summary
                </h3>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                  {radonSummary(radonTest?.average_pci)}
                </p>
              </div>

              {radonTest?.notes && (
                <div className="mt-5 rounded-xl border border-slate-300 bg-white p-5">
                  <h3 className="text-xl font-semibold text-slate-950">Notes</h3>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                    {radonTest.notes}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {showMold && (
          <section className="avoid-break page-break bg-white p-8 text-slate-950">
            <div className="rounded-2xl border border-slate-300 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                    Mold Sampling Results
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                    Mold Summary
                  </h2>
                </div>

                <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${resultClass(moldResult)}`}>
                  {moldResult}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Info
                  label="Air Samples"
                  value={
                    moldTest?.air_samples ??
                    inspection.mold_air_samples ??
                    "0"
                  }
                />
                <Info
                  label="Surface/Tape/Swab Samples"
                  value={
                    moldTest?.surface_samples ??
                    inspection.mold_surface_samples ??
                    "0"
                  }
                />
                <Info label="Lab Status" value={moldTest?.lab_status || "Pending Collection"} />
                <Info label="Lab Name" value={moldTest?.lab_name || "N/A"} />
                <Info label="Lab Report" value={moldTest?.lab_report_url ? "Available" : "N/A"} />
                <Info label="Mold Fee" value={money(inspection.mold_fee)} />
              </div>

              <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-5">
                <h3 className="text-xl font-semibold text-slate-950">
                  Client Summary
                </h3>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                  {moldSummary(moldTest, inspection)}
                </p>
              </div>

              {moldTest?.findings && (
                <div className="mt-5 rounded-xl border border-slate-300 bg-white p-5">
                  <h3 className="text-xl font-semibold text-slate-950">
                    Lab Findings / Summary
                  </h3>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                    {moldTest.findings}
                  </p>
                </div>
              )}

              {moldTest?.notes && (
                <div className="mt-5 rounded-xl border border-slate-300 bg-white p-5">
                  <h3 className="text-xl font-semibold text-slate-950">Notes</h3>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                    {moldTest.notes}
                  </p>
                </div>
              )}

              {moldTest?.lab_report_url && (
                <div className="print-hide mt-5">
                  <a
                    href={moldTest.lab_report_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-xl border border-purple-600 px-5 py-3 font-bold text-purple-700 hover:bg-purple-50"
                  >
                    Open Lab Report
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="bg-white p-8 text-slate-950">
          <div className="rounded-2xl border border-slate-300 bg-slate-50 p-6">
            <h2 className="text-2xl font-semibold text-slate-950">
              Environmental Testing Disclaimer
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              This report documents the environmental testing service(s)
              requested for the property listed above. Unless a full home
              inspection was also performed, this report is limited to the
              specific radon and/or mold sampling services identified and does
              not represent a complete home inspection.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </p>
      <p className="mt-2 text-base font-bold text-slate-950">
        {value || "N/A"}
      </p>
    </div>
  );
}
