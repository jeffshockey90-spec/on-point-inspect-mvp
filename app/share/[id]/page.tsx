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
  },
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

function getPhotoStoragePath(photo: any) {
  return (
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url) ||
    ""
  );
}

function getFallbackPhotoUrl(photo: any) {
  return (
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    ""
  );
}

function isReportDefect(finding: any) {
  const section = String(finding?.section || "")
    .toLowerCase()
    .trim();
  const title = String(finding?.title || "")
    .toLowerCase()
    .trim();

  const nonDefectTitles = new Set([
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ]);

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;
  if (nonDefectTitles.has(title)) return false;

  // Section Reference Photos are stored in section_reference_photos,
  // not findings. This extra guard prevents any old/misfiled
  // reference-photo record from being counted as a defect.
  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function buildDefectTotals(findings: any[]) {
  return (findings || []).filter(isReportDefect).reduce(
    (acc: Record<string, number>, finding: any) => {
      const severity = String(
        finding.severity || "Recommended Repair",
      ).toLowerCase();

      acc.total += 1;

      if (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      ) {
        acc.safety += 1;
      } else if (severity.includes("repair") || severity.includes("defect")) {
        acc.repair += 1;
      } else if (
        severity.includes("maintenance") ||
        severity.includes("monitor") ||
        severity.includes("minor")
      ) {
        acc.maintenance += 1;
      } else if (
        severity.includes("information") ||
        severity.includes("info") ||
        severity.includes("client")
      ) {
        acc.information += 1;
      } else {
        acc.repair += 1;
      }

      return acc;
    },
    {
      total: 0,
      safety: 0,
      repair: 0,
      maintenance: 0,
      information: 0,
    },
  );
}

function getSeverityBadgeClass(severity: string | null | undefined) {
  const value = String(severity || "").toLowerCase();

  if (
    value.includes("safety") ||
    value.includes("hazard") ||
    value.includes("major")
  ) {
    return "border-red-500/60 bg-red-500/15 text-red-200";
  }

  if (value.includes("repair") || value.includes("defect")) {
    return "border-orange-400/60 bg-orange-500/15 text-orange-200";
  }

  if (
    value.includes("maintenance") ||
    value.includes("monitor") ||
    value.includes("minor")
  ) {
    return "border-yellow-400/60 bg-yellow-500/15 text-yellow-200";
  }

  if (
    value.includes("information") ||
    value.includes("info") ||
    value.includes("client")
  ) {
    return "border-blue-400/60 bg-blue-500/15 text-blue-200";
  }

  return "border-teal-400/60 bg-teal-500/15 text-teal-200";
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path))),
  );

  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const chunkSize = 50;

  for (let i = 0; i < uniquePaths.length; i += chunkSize) {
    const chunk = uniquePaths.slice(i, i + chunkSize);

    const { data, error } = await supabase.storage
      .from("inspection-photos")
      .createSignedUrls(chunk, 60 * 60 * 24 * 7);

    if (error) {
      console.error("Share batch signed photo error:", error);
      continue;
    }

    (data || []).forEach((item: any, index: number) => {
      const path = item?.path || chunk[index];
      if (path && item?.signedUrl) {
        signedMap[path] = item.signedUrl;
      }
    });
  }

  return signedMap;
}

function groupChecklistRows(rows: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  (rows || []).forEach((row: any) => {
    if (!grouped[row.section]) grouped[row.section] = {};
    if (!grouped[row.section][row.group_title])
      grouped[row.section][row.group_title] = [];
    grouped[row.section][row.group_title].push(row);
  });

  return grouped;
}

function groupLimitations(
  rows: any[],
  photosByLimitationId: Record<string, any[]>,
) {
  const grouped: Record<string, any[]> = {};

  (rows || []).forEach((row: any) => {
    if (!grouped[row.section]) grouped[row.section] = [];
    grouped[row.section].push({
      ...row,
      photos: photosByLimitationId[row.id] || [],
    });
  });

  return grouped;
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

  const photoStoragePaths = (photosRaw || [])
    .map((photo: any) => getPhotoStoragePath(photo))
    .filter(Boolean);

  const oldFindingImagePaths = (findingsRaw || [])
    .map((finding: any) => getStoragePathFromUrl(finding.image_url))
    .filter(Boolean);

  const signedUrlMap = await createSignedUrlMap([
    ...photoStoragePaths,
    ...oldFindingImagePaths,
  ]);

  const photosWithUrls = (photosRaw || []).map((photo: any) => {
    const path = getPhotoStoragePath(photo);

    return {
      ...photo,
      signed_url: (path && signedUrlMap[path]) || getFallbackPhotoUrl(photo),
    };
  });

  const photosByFindingId = photosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.finding_id) return acc;
      if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
      acc[photo.finding_id].push(photo);
      return acc;
    },
    {},
  );

  const findings = (findingsRaw || []).map((finding: any) => {
    const oldImagePath = getStoragePathFromUrl(finding.image_url);
    const signedImageUrl =
      (oldImagePath && signedUrlMap[oldImagePath]) ||
      finding.signed_image_url ||
      finding.public_image_url ||
      finding.image_url ||
      null;

    return {
      ...finding,
      section: normalizeSection(finding.section),
      signed_image_url: signedImageUrl,
      image_url: signedImageUrl || finding.image_url || null,
      photos: photosByFindingId[finding.id] || [],
    };
  });

  const { data: checklistRows } = await supabase
    .from("section_checklist_selections")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const { data: limitationRows } = await supabase
    .from("section_limitations")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const limitationIds = (limitationRows || []).map((item: any) => item.id);

  const { data: limitationPhotosRaw } =
    limitationIds.length > 0
      ? await supabase
          .from("limitation_photos")
          .select("*")
          .in("limitation_id", limitationIds)
      : { data: [] };

  const limitationPhotoPaths = (limitationPhotosRaw || [])
    .map((photo: any) => photo.file_path)
    .filter(Boolean);

  const limitationSignedUrlMap = await createSignedUrlMap(limitationPhotoPaths);

  const limitationPhotosWithUrls = (limitationPhotosRaw || []).map(
    (photo: any) => ({
      ...photo,
      signed_url:
        (photo.file_path && limitationSignedUrlMap[photo.file_path]) ||
        photo.public_url ||
        "",
    }),
  );

  const photosByLimitationId = limitationPhotosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.limitation_id) return acc;
      if (!acc[photo.limitation_id]) acc[photo.limitation_id] = [];
      acc[photo.limitation_id].push(photo);
      return acc;
    },
    {},
  );

  const checklistBySection = groupChecklistRows(checklistRows || []);
  const limitationsBySection = groupLimitations(
    limitationRows || [],
    photosByLimitationId,
  );

  const { data: sectionReferencePhotosRaw } = await supabase
    .from("section_reference_photos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const referencePhotoPaths = (sectionReferencePhotosRaw || [])
    .map((photo: any) => photo.file_path)
    .filter(Boolean);

  const referenceSignedUrlMap = await createSignedUrlMap(referencePhotoPaths);

  const sectionReferencePhotos = (sectionReferencePhotosRaw || []).map(
    (photo: any) => ({
      ...photo,
      signed_url:
        (photo.file_path && referenceSignedUrlMap[photo.file_path]) ||
        photo.public_url ||
        "",
    }),
  );

  const referencePhotosBySection = sectionReferencePhotos.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.section) return acc;
      if (!acc[photo.section]) acc[photo.section] = [];
      acc[photo.section].push(photo);
      return acc;
    },
    {},
  );

  const { data: reportDisclaimers } = await supabase
    .from("report_disclaimers")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const propertyPhoto = getPropertyPhoto(inspection);
  const defectTotals = buildDefectTotals(findings);

  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findings.filter((finding: any) => finding.section === section),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = findings.filter(
    (finding: any) => !SECTION_ORDER.includes(finding.section),
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
          <section className="relative border-b border-teal-500/20 bg-black">
            <img
              src={propertyPhoto}
              alt="Property"
              className="h-80 w-full object-cover opacity-90 md:h-[28rem]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
                Shared Inspection Report
              </p>
              <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl">
                On Point Home Inspections
              </h1>
              <p className="mt-3 max-w-2xl text-base font-semibold text-slate-200 md:text-lg">
                Residential Home Inspection Report • Protecting Your Investment.
                One Inspection at a Time.
              </p>
            </div>
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

          <header className="rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#071224] via-[#0f172a] to-[#020617] p-6 shadow-2xl md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.35em] text-teal-400">
                  Client Report Portal
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
              </div>

              <div className="rounded-2xl border border-teal-400/30 bg-teal-500/10 p-4 text-left md:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">
                  Inspection Address
                </p>
                <p className="mt-2 max-w-sm text-lg font-black text-white">
                  {inspection.property_address || inspection.address || "N/A"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {inspection.city || ""} {inspection.state || ""}{" "}
                  {inspection.zip || ""}
                </p>
              </div>
            </div>
          </header>

          <nav className="mt-6 grid gap-3 text-sm font-bold print:hidden sm:grid-cols-2 lg:grid-cols-5">
            <a
              href="#property-info"
              className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-center text-slate-200 transition hover:border-teal-500 hover:text-teal-300"
            >
              Property Info
            </a>
            <a
              href="#defect-summary"
              className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-center text-slate-200 transition hover:border-teal-500 hover:text-teal-300"
            >
              Defect Summary
            </a>
            <a
              href="#findings"
              className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-center text-slate-200 transition hover:border-teal-500 hover:text-teal-300"
            >
              Findings
            </a>
            <a
              href="#limitations"
              className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-center text-slate-200 transition hover:border-teal-500 hover:text-teal-300"
            >
              Limitations
            </a>
            <a
              href="#disclaimers"
              className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3 text-center text-slate-200 transition hover:border-teal-500 hover:text-teal-300"
            >
              Disclaimers
            </a>
          </nav>

          <section
            id="defect-summary"
            className="mt-8 rounded-3xl border border-teal-500/40 bg-gradient-to-br from-[#071224] via-[#0f172a] to-[#020617] p-6 shadow-xl"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Client Report Overview
                </p>

                <h2 className="mt-2 text-2xl font-extrabold text-white">
                  Defect Summary
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Section Reference Photos are documentation photos only and are
                  not counted as defects.
                </p>
              </div>

              <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-6 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">
                  Total Defects
                </p>
                <p className="mt-1 text-4xl font-black text-white">
                  {defectTotals.total}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DefectSummaryCard
                label="Safety / Major"
                value={defectTotals.safety}
              />
              <DefectSummaryCard
                label="Recommended Repair"
                value={defectTotals.repair}
              />
              <DefectSummaryCard
                label="Maintenance / Monitor"
                value={defectTotals.maintenance}
              />
              <DefectSummaryCard
                label="Informational"
                value={defectTotals.information}
              />
            </div>
          </section>

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

          <section
            id="property-info"
            className="mt-8 rounded-3xl border border-slate-700 bg-[#071224] p-6 shadow-xl"
          >
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
              <Info
                label="Inspection Date"
                value={inspection.inspection_date}
              />
              <Info
                label="Inspection Time"
                value={inspection.inspection_time}
              />
              <Info label="Year Built" value={inspection.year_built} />
              <Info
                label="Square Feet"
                value={inspection.square_feet || inspection.sqft}
              />
            </div>
          </section>

          {Object.keys(checklistBySection).length > 0 && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <h2 className="mb-5 text-2xl font-bold text-teal-400">
                Inspection Information
              </h2>

              <div className="space-y-6">
                {SECTION_ORDER.filter(
                  (section) => checklistBySection[section],
                ).map((section) => (
                  <div
                    key={section}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                  >
                    <h3 className="mb-4 text-xl font-bold text-white">
                      {section}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(checklistBySection[section]).map(
                        ([groupTitle, rows]: any) => (
                          <div key={groupTitle}>
                            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
                              {groupTitle}
                            </p>

                            <p className="mt-1 whitespace-pre-line text-slate-100">
                              {(rows || [])
                                .map((row: any) => row.custom_text || row.value)
                                .filter(
                                  (value: string) => value !== "__TEXT_VALUE__",
                                )
                                .join(", ") || "N/A"}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {Object.keys(limitationsBySection).length > 0 && (
            <section
              id="limitations"
              className="mt-8 rounded-2xl border border-yellow-500/40 bg-[#071224] p-6"
            >
              <h2 className="mb-5 text-2xl font-bold text-yellow-300">
                Limitations
              </h2>

              <div className="space-y-6">
                {SECTION_ORDER.filter(
                  (section) => limitationsBySection[section],
                ).map((section) => (
                  <div
                    key={section}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                  >
                    <h3 className="mb-4 text-xl font-bold text-white">
                      {section}
                    </h3>

                    <div className="space-y-5">
                      {(limitationsBySection[section] || []).map(
                        (item: any) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-700 bg-[#020617] p-4"
                          >
                            <p className="font-bold text-yellow-200">
                              {item.custom_text || item.label}
                            </p>

                            {item.limitation_comment && (
                              <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                                {item.limitation_comment}
                              </p>
                            )}

                            {item.photos?.length > 0 && (
                              <div className="mt-4 grid gap-3 md:grid-cols-3">
                                {item.photos.map((photo: any) => (
                                  <img
                                    key={photo.id}
                                    src={photo.signed_url || photo.public_url}
                                    alt="Limitation photo"
                                    className="max-h-[260px] w-full rounded-xl border border-slate-700 object-cover"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {reportDisclaimers && reportDisclaimers.length > 0 && (
            <section
              id="disclaimers"
              className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6"
            >
              <h2 className="mb-5 text-2xl font-bold text-purple-300">
                Disclaimers
              </h2>

              <div className="space-y-5">
                {reportDisclaimers.map((disclaimer: any) => (
                  <div
                    key={disclaimer.id}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                  >
                    <h3 className="text-xl font-bold text-white">
                      {disclaimer.topic}
                    </h3>

                    <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                      {disclaimer.disclaimer_text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="findings" className="mt-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Report Details
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  Inspection Findings
                </h2>
              </div>
              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-3 text-sm font-bold text-teal-200">
                {defectTotals.total} total defects
              </div>
            </div>

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
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
                      <h3 className="text-2xl font-black text-white">
                        {group.section}
                      </h3>
                      <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-300">
                        {group.findings.filter(isReportDefect).length} Findings
                      </span>
                    </div>

                    {referencePhotosBySection[group.section]?.length > 0 && (
                      <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                        <h4 className="mb-3 text-lg font-bold text-cyan-300">
                          Section Reference Photos
                        </h4>

                        <p className="mb-4 text-sm text-slate-400">
                          These photos document general section conditions and
                          are not defect findings.
                        </p>

                        <div className="grid gap-4 md:grid-cols-3">
                          {referencePhotosBySection[group.section].map(
                            (photo: any, index: number) => {
                              const photoUrl =
                                photo.signed_url || photo.public_url || "";

                              if (!photoUrl) return null;

                              return (
                                <div
                                  key={photo.id || index}
                                  className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617]"
                                >
                                  <img
                                    src={photoUrl}
                                    alt={
                                      photo.caption ||
                                      `Section reference photo ${index + 1}`
                                    }
                                    className="max-h-[280px] w-full object-cover"
                                  />

                                  {photo.caption && (
                                    <p className="border-t border-slate-800 px-3 py-2 text-sm text-slate-300">
                                      {photo.caption}
                                    </p>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-6">
                      {group.findings.map((finding: any) => {
                        const firstPhoto = (finding.photos || [])[0];

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
                            className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl"
                          >
                            <div className="border-b border-slate-700 bg-[#020617]/70 p-5">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                                    {finding.section}
                                  </p>
                                  <h4 className="mt-2 text-2xl font-black text-teal-300">
                                    {finding.title || "Untitled Finding"}
                                  </h4>
                                </div>

                                <span
                                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${getSeverityBadgeClass(
                                    finding.severity || "Recommended Repair",
                                  )}`}
                                >
                                  {finding.severity || "Recommended Repair"}
                                </span>
                              </div>
                            </div>

                            <div className="p-5">
                              {image && (
                                <img
                                  src={image}
                                  alt="Inspection finding"
                                  className="mb-5 max-h-[480px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                                />
                              )}

                              <div className="grid gap-4">
                                <FindingDetailCard
                                  title="Observation"
                                  value={finding.observation}
                                  tone="blue"
                                />

                                <FindingDetailCard
                                  title="Implication"
                                  value={finding.implication}
                                  tone="amber"
                                />

                                <FindingDetailCard
                                  title="Recommendation"
                                  value={finding.recommendation}
                                  tone="teal"
                                />

                                <FindingDetailCard
                                  title="Additional Notes"
                                  value={finding.comment}
                                  tone="slate"
                                />
                              </div>
                            </div>
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

function DefectSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5 text-center shadow-lg">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function FindingDetailCard({
  title,
  value,
  tone,
}: {
  title: string;
  value?: any;
  tone: "blue" | "amber" | "teal" | "slate";
}) {
  if (!value) return null;

  const toneClasses: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-200",
    slate: "border-slate-600 bg-[#020617] text-slate-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-[0.25em]">{title}</p>

      <p className="mt-3 whitespace-pre-line text-base leading-7 text-slate-100">
        {value}
      </p>
    </div>
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
