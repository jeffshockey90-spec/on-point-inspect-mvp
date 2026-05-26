import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import PdfExportButton from "../../../components/PdfExportButton";

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
  "Disclaimers",
  "Garage",
];

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

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const inspectionId = resolvedParams.id;

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  const { data: findings, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false });

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("inspection_id", inspectionId);

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Report not found.
      </main>
    );
  }

  if (findingsError) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Error loading report findings.
      </main>
    );
  }

  const propertyPhoto = getPropertyPhoto(inspection);

  const findingsWithPhotos = (findings || []).map((finding: any) => ({
    ...finding,
    photos: (photos || []).filter(
      (photo: any) => photo.finding_id === finding.id
    ),
  }));

  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findingsWithPhotos.filter(
      (finding: any) => finding.section === section
    ),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = findingsWithPhotos.filter(
    (finding: any) => !SECTION_ORDER.includes(finding.section)
  );

  if (otherFindings.length > 0) {
    groupedFindings.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] shadow-2xl">
        {propertyPhoto && (
          <section className="border-b border-slate-800 bg-black">
            <img
              src={propertyPhoto}
              alt="Property"
              className="h-72 w-full object-cover md:h-96"
            />
          </section>
        )}

        <div className="p-5 md:p-10">
          <div className="mb-8 flex flex-wrap gap-3 print:hidden">
            <PdfExportButton />

            <Link
              href={`/reports/${inspectionId}/summary`}
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-400 transition hover:bg-teal-500 hover:text-black"
            >
              Report Summary
            </Link>

            <Link
              href={`/reports/${inspectionId}`}
              className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              Full Editable Report
            </Link>
          </div>

          <header className="border-b border-slate-700 pb-6">
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-teal-400">
              Shared Inspection Report
            </p>

            <h1 className="mt-3 text-4xl font-extrabold text-white">
              On Point Home Inspections
            </h1>

            <p className="mt-3 text-lg text-slate-300">
              Residential Home Inspection Report
            </p>

            <p className="mt-4 text-sm text-slate-400">
              Protecting Your Investment. One Inspection at a Time.
            </p>
          </header>

          {inspection.report_summary && (
            <section className="mt-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
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

          <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <h2 className="mb-5 text-2xl font-bold text-teal-400">
              Property Information
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
              <Info
                label="Property"
                value={inspection.property_address || inspection.address}
              />

              <Info
                label="Location"
                value={`${inspection.city || ""}, ${
                  inspection.state || ""
                } ${inspection.zip || ""}`}
              />

              <Info label="Client" value={inspection.client_name} />
              <Info label="Realtor" value={inspection.realtor_name} />
              <Info label="Inspection Date" value={inspection.inspection_date} />
              <Info label="Inspection Time" value={inspection.inspection_time} />
              <Info label="Year Built" value={inspection.year_built} />
              <Info
                label="Square Feet"
                value={inspection.square_feet || inspection.sqft}
              />
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <h2 className="mb-4 text-2xl font-bold text-teal-400">
              Report Notice
            </h2>

            <p className="leading-7 text-slate-300">
              This shared report view is provided for convenient client and
              realtor review. The report is based on a visual, non-invasive
              inspection of readily accessible systems and components at the time
              of inspection.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="mb-8 text-3xl font-bold text-teal-400">
              Inspection Findings
            </h2>

            {groupedFindings.length === 0 ? (
              <div className="rounded-2xl border border-slate-700 bg-[#071224] p-8 text-center text-slate-300">
                No findings saved yet.
              </div>
            ) : (
              <div className="space-y-8">
                {groupedFindings.map((group) => (
                  <section
                    key={group.section}
                    className="rounded-2xl border border-slate-700 bg-[#071224] p-6"
                  >
                    <h3 className="mb-6 border-b border-slate-700 pb-3 text-2xl font-bold text-white">
                      {group.section}
                    </h3>

                    <div className="space-y-6">
                      {group.findings.map((finding: any) => (
                        <article
                          key={finding.id}
                          className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-3">
                            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-300">
                              {finding.severity || "Recommended Repair"}
                            </span>
                          </div>

                          {finding.image_url && (
                            <img
                              src={finding.image_url}
                              alt="Inspection finding"
                              className="mb-5 max-h-[450px] w-full rounded-xl border border-slate-700 object-contain"
                            />
                          )}

                          {finding.photos?.length > 0 && (
                            <div className="mb-5 grid gap-4 md:grid-cols-2">
                              {finding.photos.map((photo: any) => (
                                <img
                                  key={photo.id}
                                  src={
                                    photo.signed_url ||
                                    photo.public_url ||
                                    photo.image_url ||
                                    photo.photo_url
                                  }
                                  alt="Inspection finding"
                                  className="max-h-[320px] w-full rounded-xl border border-slate-700 object-cover"
                                />
                              ))}
                            </div>
                          )}

                          <h4 className="text-2xl font-bold text-teal-300">
                            {finding.title}
                          </h4>

                          {finding.observation && (
                            <p className="mt-4 whitespace-pre-line leading-7 text-slate-300">
                              <span className="font-bold text-white">
                                Observation:
                              </span>{" "}
                              {finding.observation}
                            </p>
                          )}

                          {finding.implication && (
                            <p className="mt-4 whitespace-pre-line leading-7 text-slate-300">
                              <span className="font-bold text-white">
                                Implication:
                              </span>{" "}
                              {finding.implication}
                            </p>
                          )}

                          {finding.recommendation && (
                            <p className="mt-4 whitespace-pre-line leading-7 text-slate-300">
                              <span className="font-bold text-white">
                                Recommendation:
                              </span>{" "}
                              {finding.recommendation}
                            </p>
                          )}

                          {finding.comment && (
                            <p className="mt-4 whitespace-pre-line leading-7 text-slate-300">
                              <span className="font-bold text-white">
                                Additional Notes:
                              </span>{" "}
                              {finding.comment}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <footer className="mt-12 border-t border-slate-700 pt-6 text-sm text-slate-400">
            <p>On Point Home Inspections LLC • Shared Report Portal</p>
          </footer>
        </div>
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
