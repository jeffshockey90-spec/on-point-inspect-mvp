import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PdfExportButton from "../../../components/PdfExportButton";

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

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Disclaimers",
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

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(url.substring(index + marker.length));
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

async function signPhotoUrl(photo: any) {
  const filePath =
    photo.file_path ||
    photo.storage_path ||
    photo.photo_path ||
    getStoragePathFromUrl(photo.public_url) ||
    getStoragePathFromUrl(photo.image_url) ||
    getStoragePathFromUrl(photo.photo_url);

  if (!filePath) {
    return (
      photo.signed_url ||
      photo.public_url ||
      photo.image_url ||
      photo.photo_url ||
      ""
    );
  }

  const { data, error } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);

  if (error) {
    console.error("Share signed photo error:", error);
  }

  return (
    data?.signedUrl ||
    photo.signed_url ||
    photo.public_url ||
    photo.image_url ||
    photo.photo_url ||
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

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Report not found.
      </main>
    );
  }

  const { data: findingsRaw, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  if (findingsError) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Error loading report findings.
      </main>
    );
  }

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  const { data: photosRaw, error: photosError } =
    findingIds.length > 0
      ? await supabase.from("photos").select("*").in("finding_id", findingIds)
      : { data: [], error: null };

  if (photosError) {
    console.error("Share photos load error:", photosError);
  }

  const photosWithUrls = await Promise.all(
    (photosRaw || []).map(async (photo: any) => ({
      ...photo,
      signed_url: await signPhotoUrl(photo),
    }))
  );

  const photosByFindingId = photosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.finding_id) return acc;
      if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
      acc[photo.finding_id].push(photo);
      return acc;
    },
    {}
  );

  const findings = await Promise.all(
    (findingsRaw || []).map(async (finding: any) => {
      let signedImageUrl = finding.image_url || "";

      const oldImagePath = getStoragePathFromUrl(finding.image_url);

      if (oldImagePath) {
        const { data, error } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(oldImagePath, 60 * 60 * 24 * 7);

        if (error) {
          console.error("Share old finding image sign error:", error);
        }

        if (!error && data?.signedUrl) {
          signedImageUrl = data.signedUrl;
        }
      }

      return {
        ...finding,
        section: normalizeSection(finding.section),
        signed_image_url: signedImageUrl,
        image_url: signedImageUrl || finding.image_url || null,
        photos: photosByFindingId[finding.id] || [],
      };
    })
  );

  const propertyPhoto = getPropertyPhoto(inspection);

  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findings.filter((finding: any) => finding.section === section),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = findings.filter(
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
                value={`${inspection.city || ""}, ${inspection.state || ""} ${
                  inspection.zip || ""
                }`}
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
                      {group.findings.map((finding: any) => {
                        const firstPhoto = finding.photos?.[0];

                        const image =
                          firstPhoto?.signed_url ||
                          firstPhoto?.public_url ||
                          firstPhoto?.image_url ||
                          firstPhoto?.photo_url ||
                          finding.signed_image_url ||
                          finding.image_url ||
                          finding.public_image_url ||
                          "";

                        return (
                          <article
                            key={finding.id}
                            className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                          >
                            <div className="mb-3 flex flex-wrap items-center gap-3">
                              <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-300">
                                {finding.severity || "Recommended Repair"}
                              </span>
                            </div>

                            {image && (
                              <img
                                src={image}
                                alt="Inspection finding"
                                className="mb-5 max-h-[450px] w-full rounded-xl border border-slate-700 object-contain"
                              />
                            )}

                            {finding.photos?.length > 0 && (
                              <div className="mb-5 grid gap-4 md:grid-cols-2">
                                {finding.photos.map((photo: any) => {
                                  const photoUrl =
                                    photo.signed_url ||
                                    photo.public_url ||
                                    photo.image_url ||
                                    photo.photo_url ||
                                    "";

                                  if (!photoUrl) return null;

                                  return (
                                    <img
                                      key={photo.id}
                                      src={photoUrl}
                                      alt="Inspection finding"
                                      className="max-h-[320px] w-full rounded-xl border border-slate-700 object-cover"
                                    />
                                  );
                                })}
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
                        );
                      })}
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