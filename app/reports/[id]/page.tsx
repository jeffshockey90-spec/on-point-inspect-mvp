import { supabase } from "../../../lib/supabaseClient";
import PrintButton from "../../../components/PrintButton";
import PdfExportButton from "../../../components/PdfExportButton";
import ShareReportButton from "../../../components/ShareReportButton";
import PublishReportButton from "../../../components/PublishReportButton";
import SendReportModal from "../../../components/SendReportModal";
import GenerateSummaryButton from "../../../components/GenerateSummaryButton";
import ReportFindingsSortable from "./ReportFindingsSortable";
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

  const { data: inspection, error: inspectionError } =
    await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading inspection
      </main>
    );
  }

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false });

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("inspection_id", inspectionId);

  const findingsWithPhotos = (findings || []).map(
    (finding: any) => ({
      ...finding,
      photos: (photos || []).filter(
        (photo: any) =>
          photo.finding_id === finding.id
      ),
    })
  );

  const allFindings = findingsWithPhotos;

  const groupedFindings = SECTION_ORDER.map(
    (section) => ({
      section,
      findings: allFindings.filter(
        (finding: any) =>
          finding.section === section
      ),
    })
  ).filter((group) => group.findings.length > 0);

  const otherFindings = allFindings.filter(
    (finding: any) =>
      !SECTION_ORDER.includes(finding.section)
  );

  if (otherFindings.length > 0) {
    groupedFindings.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl rounded-3xl bg-[#0f172a] p-6 shadow-2xl md:p-10">

        {!isPublicView && (
          <div className="mb-10 flex flex-wrap gap-3 print:hidden">
            <PrintButton />

            <PdfExportButton />

            <GenerateSummaryButton
              inspectionId={inspectionId}
            />

            <PublishReportButton
              inspectionId={inspectionId}
            />

            <ShareReportButton
              inspectionId={inspectionId}
            />

            <SendReportModal
              inspectionId={inspectionId}
              clientName={inspection.client_name}
              clientEmail={inspection.client_email}
              realtorName={inspection.realtor_name}
              realtorEmail={inspection.realtor_email}
              propertyAddress={
                inspection.property_address
              }
            />

            <Link
              href={`/repair-request/${inspectionId}`}
              className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white transition hover:bg-orange-500"
            >
              Repair Request Builder
            </Link>

            <Link
              href={`/reports/${inspectionId}/summary`}
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 transition hover:bg-teal-500 hover:text-black"
            >
              Realtor Summary
            </Link>

            <Link
              href={`/ai-capture?inspection_id=${encodeURIComponent(
                inspectionId
              )}`}
              className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
            >
              Open Full AI Capture
            </Link>

            <Link
              href={`/equipment-test?inspection_id=${encodeURIComponent(
                inspectionId
              )}`}
              className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 transition hover:bg-blue-500 hover:text-white"
            >
              Equipment Analyzer
            </Link>
          </div>
        )}

        <header className="border-b border-slate-700 pb-8">
          <h1 className="text-5xl font-extrabold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-300">
            Residential Home Inspection Report
          </p>
        </header>

        {/* INSPECTION DETAILS */}
        <section className="mt-10 grid gap-6 md:grid-cols-2">

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <h2 className="mb-4 text-2xl font-bold text-teal-400">
              Inspection Details
            </h2>

            <div className="space-y-3 text-slate-300">
              <p>
                <span className="font-bold text-white">
                  Property Address:
                </span>{" "}
                {inspection.property_address ||
                  inspection.address ||
                  "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Client:
                </span>{" "}
                {inspection.client_name || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Client Email:
                </span>{" "}
                {inspection.client_email || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Realtor:
                </span>{" "}
                {inspection.realtor_name || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Realtor Email:
                </span>{" "}
                {inspection.realtor_email || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Inspection Date:
                </span>{" "}
                {inspection.inspection_date ||
                  inspection.date ||
                  "N/A"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <h2 className="mb-4 text-2xl font-bold text-teal-400">
              Property / Site Information
            </h2>

            <div className="space-y-3 text-slate-300">

              <p>
                <span className="font-bold text-white">
                  Square Feet:
                </span>{" "}
                {inspection.sqft ||
                  inspection.square_feet ||
                  "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  House Style:
                </span>{" "}
                {inspection.house_style || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Roof Style:
                </span>{" "}
                {inspection.roof_style || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Garage:
                </span>{" "}
                {inspection.garage || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Weather:
                </span>{" "}
                {inspection.weather || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Temperature:
                </span>{" "}
                {inspection.temperature || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Attendance:
                </span>{" "}
                {inspection.attendance || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Inspection Method:
                </span>{" "}
                {inspection.inspection_method || "N/A"}
              </p>

              <p>
                <span className="font-bold text-white">
                  Occupancy:
                </span>{" "}
                {inspection.occupancy || "N/A"}
              </p>

            </div>
          </div>
        </section>

        {inspection.executive_summary && (
          <section className="mt-8 rounded-2xl border border-purple-700 bg-purple-950/20 p-6">
            <h2 className="mb-4 text-3xl font-bold text-purple-300">
              Executive Summary
            </h2>

            <p className="whitespace-pre-line leading-8 text-slate-200">
              {inspection.executive_summary}
            </p>
          </section>
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

      </div>
    </main>
  );
}