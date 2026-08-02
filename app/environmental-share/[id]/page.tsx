
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PdfExportButton from "../../../components/PdfExportButton";
import { getInspectionShareToken } from "../../../lib/shareToken";
import { getCompanyBrandingById } from "../../../lib/companyBranding";

type PageProps = {
  params: Promise<{ id: string }>;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


async function recordInspectionView(inspectionId: string | number) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: "environmental_share",
      path: `/environmental-share/${inspectionId}`,
      metadata: {
        source: "environmental_share_page",
      },
    });
  } catch (error) {
    console.error("Environmental share view tracking error:", error);
  }
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

function formatDate(value: any) {
  if (!value) return "N/A";
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
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }

  if (clean.includes("monitor") || clean.includes("pending")) {
    return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
  }

  return "border-green-500/40 bg-green-500/10 text-green-300";
}

export default async function PublicEnvironmentalSharePage({ params }: PageProps) {
  const { id: shareLookup } = await params;

  const { data: inspectionByToken, error: tokenLookupError } = await supabase
    .from("inspections")
    .select("*")
    .eq("public_share_token", shareLookup)
    .maybeSingle();

  // Resolve ONLY by the unguessable share token. The old numeric-id fallback
  // let anyone enumerate sequential ids to pull mold/radon lab results, so it
  // has been removed — legitimate share links always carry the token.
  const inspection = inspectionByToken;
  const inspectionError = tokenLookupError;

  const id = inspection ? String(inspection.id) : shareLookup;

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Environmental report not found.
      </main>
    );
  }

  await recordInspectionView(id);

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
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-[80rem] overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-2xl">
        <section className="relative overflow-hidden border-b border-slate-800 bg-[#020617]">
          {propertyPhoto ? (
            <>
              <img
                src={propertyPhoto}
                alt="Property"
                className="h-[320px] w-full object-cover md:h-[460px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/35 to-black/20" />
            </>
          ) : (
            <div className="h-[320px] bg-gradient-to-br from-[#020617] via-[#071224] to-[#0f172a]" />
          )}

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.38em] text-teal-300">
              {branding.name}
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-6xl">
              {reportTitle}
            </h1>

            <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-slate-200">
              {address}
            </p>
          </div>
        </section>

        <div className="p-5 md:p-10">
          <div className="mb-8 flex flex-wrap gap-3 print:hidden">
            <PdfExportButton />

            <Link
              href={`/client-portal/${getInspectionShareToken(inspection) || inspection.id}`}
              className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-500/10"
            >
              Client Portal
            </Link>
          </div>

          <section className="rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <h2 className="text-2xl font-black text-teal-300">
              Service Overview
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Info label="Property" value={address} />
              <Info label="Client" value={inspection.client_name} />
              <Info label="Date" value={formatDate(inspection.inspection_date)} />
              <Info label="Time" value={inspection.inspection_time} />
              <Info label="Service Type" value={inspection.inspection_type || inspection.services} />
              <Info
                label="Location"
                value={`${inspection.city || ""}, ${inspection.state || ""} ${
                  inspection.zip || ""
                }`}
              />
            </div>
          </section>

          {showRadon && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.28em] text-teal-300">
                    Radon Testing Results
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-white">
                    Radon Summary
                  </h2>
                </div>

                <span className={`rounded-full border px-4 py-2 text-sm font-black ${resultClass(radonResult)}`}>
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

              <div className="mt-6 rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
                <h3 className="text-xl font-black text-white">
                  Client Summary
                </h3>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                  {radonSummary(radonTest?.average_pci)}
                </p>
              </div>

              {radonTest?.notes && (
                <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
                  <h3 className="text-xl font-black text-white">Notes</h3>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                    {radonTest.notes}
                  </p>
                </div>
              )}
            </section>
          )}

          {showMold && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.28em] text-teal-300">
                    Mold Sampling Results
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-white">
                    Mold Summary
                  </h2>
                </div>

                <span className={`rounded-full border px-4 py-2 text-sm font-black ${resultClass(moldResult)}`}>
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

              <div className="mt-6 rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
                <h3 className="text-xl font-black text-white">
                  Client Summary
                </h3>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                  {moldSummary(moldTest, inspection)}
                </p>
              </div>

              {moldTest?.findings && (
                <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
                  <h3 className="text-xl font-black text-white">
                    Lab Findings / Summary
                  </h3>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                    {moldTest.findings}
                  </p>
                </div>
              )}

              {moldTest?.lab_report_url && (
                <div className="mt-5">
                  <a
                    href={moldTest.lab_report_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10"
                  >
                    Open Lab Report
                  </a>
                </div>
              )}
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <h2 className="text-2xl font-black text-teal-300">
              Environmental Testing Disclaimer
            </h2>
            <p className="mt-3 leading-7 text-slate-300">
              This report documents the environmental testing service(s)
              requested for the property listed above. Unless a full home
              inspection was also performed, this report is limited to the
              specific radon and/or mold sampling services identified and does
              not represent a complete home inspection.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-base font-bold text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}
