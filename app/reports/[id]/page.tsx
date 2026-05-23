import { supabase } from "../../../lib/supabaseClient";
import FindingGenerator from "../../../components/FindingGenerator";
import DataPlateScanner from "../../../components/DataPlateScanner";
import PrintButton from "../../../components/PrintButton";
import PdfExportButton from "../../../components/PdfExportButton";
import ShareReportButton from "../../../components/ShareReportButton";
import PublishReportButton from "../../../components/PublishReportButton";
import SendReportModal from "../../../components/SendReportModal";
import InspectionDetailsEditor from "../../../components/InspectionDetailsEditor";
import ReportContactEditor from "../../../components/ReportContactEditor";
import OfflineFieldMode from "../../../components/OfflineFieldMode";
import VoiceFindingGenerator from "../../../components/VoiceFindingGenerator";
import ReportFindingsSortable from "./ReportFindingsSortable";
import ShareReportModal from "../components/share-report-modal";
import Link from "next/link";

const SECTION_ORDER = [
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

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const inspectionId = resolvedParams.id;
  const token = resolvedSearchParams.token;
  const isPublicView = Boolean(token);

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading inspection: {inspectionError?.message || "Not found"}
      </main>
    );
  }

  if (isPublicView) {
    const validToken =
      inspection.published === true &&
      inspection.share_token &&
      inspection.share_token === token;

    if (!validToken) {
      return (
        <main className="min-h-screen bg-[#020617] p-10 text-white">
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-800 bg-red-950/40 p-8">
            <h1 className="text-3xl font-bold text-red-300">
              Report Access Denied
            </h1>

            <p className="mt-3 text-red-100">
              This report link is invalid, expired, or the report has not been
              published yet.
            </p>
          </div>
        </main>
      );
    }
  }

  const { data: findings, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false });

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("inspection_id", inspectionId);

  if (findingsError) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading findings: {findingsError.message}
      </main>
    );
  }

  const findingsWithPhotos = (findings || []).map((finding: any) => ({
    ...finding,
    photos: (photos || []).filter(
      (photo: any) => photo.finding_id === finding.id
    ),
  }));

  const allFindings = findingsWithPhotos;

  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: allFindings.filter(
      (finding: any) => finding.section === section
    ),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = allFindings.filter(
    (finding: any) => !SECTION_ORDER.includes(finding.section)
  );

  if (otherFindings.length > 0) {
    groupedFindings.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  return (
    <main className="min-h-screen bg-[#0f172a] p-4 text-white md:p-6">
      <div className="mx-auto max-w-6xl rounded-2xl bg-[#111827] p-5 shadow-2xl md:p-10">
        {!isPublicView && (
          <>
            <div className="mb-8 flex flex-wrap gap-3 print:hidden">
              <PrintButton />

              <PdfExportButton />

              <PublishReportButton inspectionId={inspectionId} />

              <ShareReportButton inspectionId={inspectionId} />

              <SendReportModal
                inspectionId={inspectionId}
                clientName={inspection.client_name}
                clientEmail={inspection.client_email}
                realtorName={inspection.realtor_name}
                realtorEmail={inspection.realtor_email}
                propertyAddress={inspection.property_address}
              />

              <Link
                href={`/reports/${inspectionId}/summary`}
                className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-400 transition hover:bg-teal-500 hover:text-black"
              >
                Realtor Summary
              </Link>

              <Link
                href="/ai-capture"
                className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
              >
                Open Full AI Capture
              </Link>
            </div>

            <div className="mb-8 print:hidden">
              <ShareReportModal reportId={inspectionId} />
            </div>
          </>
        )}

        {isPublicView && (
          <div className="mb-8 rounded-2xl border border-teal-800 bg-teal-950/30 p-4 print:hidden">
            <p className="text-sm text-teal-300">
              Published report view. Editing tools are hidden.
            </p>
          </div>
        )}

        <header className="border-b border-slate-700 pb-6">
          <h1 className="text-4xl font-bold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-2 text-lg text-slate-300">
            Residential Home Inspection Report
          </p>

          <p className="mt-4 text-sm text-slate-400">
            Protecting Your Investment. One Inspection at a Time.
          </p>
        </header>

        {inspection.property_image && (
          <section className="mt-8">
            <img
              src={inspection.property_image}
              alt="Property"
              className="max-h-[500px] w-full rounded-2xl border border-slate-700 object-cover"
            />
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Property Information
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Info label="Property" value={inspection.property_address} />

            <Info
              label="Location"
              value={`${inspection.city || ""}, ${inspection.state || ""} ${
                inspection.zip || ""
              }`}
            />

            <Info label="Client" value={inspection.client_name} />
            <Info label="Client Email" value={inspection.client_email} />
            <Info label="Client Phone" value={inspection.client_phone} />
            <Info label="Realtor" value={inspection.realtor_name} />
            <Info label="Realtor Email" value={inspection.realtor_email} />
            <Info label="Inspection Date" value={inspection.inspection_date} />
            <Info label="Inspection Time" value={inspection.inspection_time} />
            <Info label="Square Feet" value={inspection.square_feet} />
            <Info label="Year Built" value={inspection.year_built} />
            <Info label="Roof Style" value={inspection.roof_style} />

            <Info
              label="Price"
              value={inspection.price ? `$${inspection.price}` : ""}
            />
          </div>
        </section>

        {!isPublicView && (
          <div className="print:hidden">
            <ReportContactEditor inspection={inspection} />
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6">
          <h2 className="mb-5 text-2xl font-bold text-teal-400">
            Inspection Details
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Info
              label="Weather"
              value={
                inspection.weather ||
                inspection.weather_conditions ||
                inspection.inspection_weather ||
                "N/A"
              }
            />

            <Info
              label="Present / In Attendance"
              value={
                inspection.attendance ||
                inspection.in_attendance ||
                inspection.people_present ||
                "N/A"
              }
            />

            <Info
              label="Inspection Method"
              value={
                inspection.inspection_method ||
                inspection.how_inspection_was_performed ||
                inspection.method ||
                "Visual inspection of readily accessible areas and components."
              }
            />
          </div>

          <p className="mt-5 leading-7 text-slate-300">
            The inspection was a visual, non-invasive evaluation of readily
            accessible systems and components at the time of inspection.
          </p>

          {!isPublicView && (
            <div className="print:hidden">
              <InspectionDetailsEditor inspection={inspection} />
            </div>
          )}
        </section>

        {!isPublicView && (
          <>
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 print:hidden">
              <h2 className="mb-5 text-2xl font-bold text-teal-400">
                AI Field Workflow
              </h2>

              <p className="mb-6 text-slate-300">
                Upload a defect photo directly from the field.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/ai-capture"
                  className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
                >
                  Launch AI Capture
                </Link>

                <Link
                  href={`/reports/${inspectionId}`}
                  className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
                >
                  Refresh Report
                </Link>
              </div>
            </section>

            <OfflineFieldMode inspectionId={inspectionId} />

            <VoiceFindingGenerator reportId={inspectionId} />

            <div className="print:hidden">
              <FindingGenerator reportId={inspectionId} />
            </div>

            <div className="print:hidden">
              <DataPlateScanner reportId={inspectionId} />
            </div>
          </>
        )}

        <section className="mt-10">
          <h2 className="mb-8 text-3xl font-bold text-teal-400">
            Inspection Findings
          </h2>

          <ReportFindingsSortable
            inspectionId={inspectionId}
            groupedFindings={groupedFindings}
            allFindings={allFindings}
          />
        </section>

        <footer className="mt-12 border-t border-slate-700 pt-6 text-sm text-slate-400">
          <p>
            On Point Home Inspections LLC • Licensed Home Inspector • InterNACHI®
            • AHIT • FAA Part 107
          </p>
        </footer>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base text-white">{value || "N/A"}</p>
    </div>
  );
}