import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PdfExportButton from "../../../components/PdfExportButton";
import ReportTimeTracker from "../../../components/ReportTimeTracker";

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


async function recordInspectionView({
  inspectionId,
  viewType,
  contactId,
  viewerRole,
  viewerEmail,
}: {
  inspectionId: string | number;
  viewType: string;
  contactId?: string | null;
  viewerRole?: string | null;
  viewerEmail?: string | null;
}) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: viewType,
      contact_id: contactId || null,
      viewer_role: viewerRole || null,
      viewer_email: viewerEmail || null,
      path: `/share/${inspectionId}`,
      metadata: {
        source: "public_share_page",
      },
    });
  } catch (error) {
    console.error("Share view tracking error:", error);
  }
}

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
  const section = String(finding?.section || "").toLowerCase().trim();
  const title = String(finding?.title || "").toLowerCase().trim();

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
  // not findings. This extra guard prevents old/misfiled reference
  // photo records from being counted as defects.
  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function getSeverityBucket(severityValue: any) {
  const severity = String(severityValue || "Recommended Repair").toLowerCase();

  if (
    severity.includes("safety") ||
    severity.includes("hazard") ||
    severity.includes("major")
  ) {
    return "safety";
  }

  if (severity.includes("repair") || severity.includes("defect")) {
    return "repair";
  }

  if (
    severity.includes("maintenance") ||
    severity.includes("monitor") ||
    severity.includes("minor")
  ) {
    return "maintenance";
  }

  if (
    severity.includes("information") ||
    severity.includes("info") ||
    severity.includes("client")
  ) {
    return "information";
  }

  return "repair";
}

function buildDefectTotals(findings: any[]) {
  return (findings || [])
    .filter(isReportDefect)
    .reduce(
      (acc: Record<string, number>, finding: any) => {
        const bucket = getSeverityBucket(finding.severity);

        if (bucket === "information") {
          acc.information += 1;
          return acc;
        }

        acc.total += 1;

        if (bucket === "safety") {
          acc.safety += 1;
        } else if (bucket === "maintenance") {
          acc.maintenance += 1;
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
      }
    );
}

function getSeverityClass(severityValue: any) {
  const bucket = getSeverityBucket(severityValue);

  if (bucket === "safety") {
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }

  if (bucket === "maintenance") {
    return "border-yellow-500/50 bg-yellow-500/15 text-yellow-200";
  }

  if (bucket === "information") {
    return "border-blue-500/50 bg-blue-500/15 text-blue-200";
  }

  return "border-teal-500/50 bg-teal-500/15 text-teal-200";
}


function getFindingTitle(finding: any) {
  return (
    finding?.title ||
    finding?.finding_title ||
    finding?.defect_title ||
    finding?.name ||
    "Untitled Finding"
  );
}

function getFindingSummary(finding: any) {
  return (
    finding?.observation ||
    finding?.recommendation ||
    finding?.implication ||
    finding?.comment ||
    "Tap to view finding details."
  );
}

function getFindingPhotoUrl(finding: any) {
  const firstPhoto = (finding?.photos || [])[0];

  return (
    firstPhoto?.signed_url ||
    firstPhoto?.public_url ||
    firstPhoto?.image_url ||
    firstPhoto?.photo_url ||
    finding?.signed_image_url ||
    finding?.image_url ||
    finding?.public_image_url ||
    ""
  );
}

function isVideoMedia(media: any, urlValue?: string) {
  const url = String(urlValue || "").toLowerCase();
  const path = String(
    media?.file_path ||
      media?.storage_path ||
      media?.photo_path ||
      media?.image_path ||
      ""
  ).toLowerCase();
  const type = String(
    media?.mime_type ||
      media?.media_type ||
      media?.content_type ||
      media?.file_type ||
      ""
  ).toLowerCase();

  return (
    Boolean(media?.is_video) ||
    Boolean(media?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    path.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null ||
    url.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null
  );
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path)))
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
    const section = normalizeSection(row.section);
    if (!grouped[section]) grouped[section] = {};
    if (!grouped[section][row.group_title]) grouped[section][row.group_title] = [];
    grouped[section][row.group_title].push(row);
  });

  return grouped;
}

function groupLimitations(rows: any[], photosByLimitationId: Record<string, any[]>) {
  const grouped: Record<string, any[]> = {};

  (rows || []).forEach((row: any) => {
    const section = normalizeSection(row.section);
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push({
      ...row,
      section,
      photos: photosByLimitationId[row.id] || [],
    });
  });

  return grouped;
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ defect_filter?: string; contact?: string; role?: string; email?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const inspectionId = resolvedParams.id;

  const requestedDefectFilter = String(
    resolvedSearchParams?.defect_filter || "all"
  ).toLowerCase();

  const activeDefectFilter = ["safety", "repair", "maintenance", "information"].includes(
    requestedDefectFilter
  )
    ? requestedDefectFilter
    : "all";

  const activeDefectFilterLabel: Record<string, string> = {
    all: "All Findings",
    safety: "Safety / Major",
    repair: "Recommended Repair",
    maintenance: "Maintenance / Monitor",
    information: "Informational",
  };

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

  await recordInspectionView({
    inspectionId,
    viewType: "report_share",
    contactId: resolvedSearchParams?.contact || null,
    viewerRole: resolvedSearchParams?.role || null,
    viewerEmail: resolvedSearchParams?.email || null,
  });

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
    {}
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

  const limitationPhotosWithUrls = (limitationPhotosRaw || []).map((photo: any) => ({
    ...photo,
    signed_url:
      (photo.file_path && limitationSignedUrlMap[photo.file_path]) ||
      photo.public_url ||
      "",
  }));

  const photosByLimitationId = limitationPhotosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.limitation_id) return acc;
      if (!acc[photo.limitation_id]) acc[photo.limitation_id] = [];
      acc[photo.limitation_id].push(photo);
      return acc;
    },
    {}
  );

  const checklistBySection = groupChecklistRows(checklistRows || []);
  const limitationsBySection = groupLimitations(
    limitationRows || [],
    photosByLimitationId
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
      section: normalizeSection(photo.section),
      signed_url:
        (photo.file_path && referenceSignedUrlMap[photo.file_path]) ||
        photo.public_url ||
        "",
    })
  );

  const referencePhotosBySection = sectionReferencePhotos.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.section) return acc;
      if (!acc[photo.section]) acc[photo.section] = [];
      acc[photo.section].push(photo);
      return acc;
    },
    {}
  );

  const { data: reportDisclaimers } = await supabase
    .from("report_disclaimers")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const { data: equipmentInventoryRaw, error: equipmentInventoryError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  if (equipmentInventoryError) {
    console.error("Share equipment inventory load error:", equipmentInventoryError);
  }

  const equipmentPhotoPaths = (equipmentInventoryRaw || [])
    .map((item: any) => item.file_path)
    .filter(Boolean);

  const equipmentSignedUrlMap = await createSignedUrlMap(equipmentPhotoPaths);

  const equipmentInventory = (equipmentInventoryRaw || []).map((item: any) => ({
    ...item,
    signed_image_url:
      (item.file_path && equipmentSignedUrlMap[item.file_path]) ||
      item.image_url ||
      "",
  }));

  const { data: moldTest } = await supabase
    .from("mold_tests")
    .select("*")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  const { data: radonTest } = await supabase
    .from("radon_tests")
    .select("*")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  const moldReportUrl = moldTest?.lab_report_url || "";
  const radonReportUrl = radonTest?.report_url || "";
  const showEnvironmentalLinks =
    (hasMoldService(inspection) && moldReportUrl) ||
    (hasRadonService(inspection) && radonReportUrl);

  const propertyPhoto = getPropertyPhoto(inspection);
  const defectTotals = buildDefectTotals(findings);

  const displayFindings =
    activeDefectFilter === "all"
      ? findings
      : findings.filter(
          (finding: any) =>
            isReportDefect(finding) &&
            getSeverityBucket(finding.severity) === activeDefectFilter
        );

  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: displayFindings.filter((finding: any) => finding.section === section),
  })).filter((group) => {
    const hasFindings = group.findings.length > 0;
    const hasReferencePhotos =
      (referencePhotosBySection[group.section] || []).length > 0;
    const hasChecklistInfo = Boolean(checklistBySection[group.section]);
    const hasLimitations =
      (limitationsBySection[group.section] || []).length > 0;

    return hasFindings || hasReferencePhotos || hasChecklistInfo || hasLimitations;
  });

  const otherFindings = displayFindings.filter(
    (finding: any) => !SECTION_ORDER.includes(finding.section)
  );

  if (otherFindings.length > 0) {
    groupedFindings.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  const sectionStats = SECTION_ORDER.map((section) => ({
    section,
    defectCount: findings.filter(
      (finding: any) =>
        finding.section === section && isReportDefect(finding)
    ).length,
    findingCount: findings.filter(
      (finding: any) => finding.section === section
    ).length,
    referenceCount: referencePhotosBySection[section]?.length || 0,
  }));

  const address =
    inspection.property_address || inspection.address || "Property Address Not Entered";

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <ReportTimeTracker
        inspectionId={String(inspectionId)}
        viewerRole={resolvedSearchParams?.role || null}
        viewerEmail={resolvedSearchParams?.email || null}
        path={`/share/${inspectionId}`}
      />

      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-2xl">
        <section className="relative overflow-hidden border-b border-slate-800 bg-[#020617]">
          {propertyPhoto ? (
            <>
              <img
                src={propertyPhoto}
                alt="Property"
                className="h-[360px] w-full object-cover md:h-[520px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/35 to-black/20" />
            </>
          ) : (
            <div className="h-[320px] bg-gradient-to-br from-[#020617] via-[#071224] to-[#0f172a]" />
          )}

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
            <div className="max-w-5xl">
              <p className="text-xs font-black uppercase tracking-[0.38em] text-teal-300">
                On Point Home Inspections
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-6xl">
                Residential Home Inspection Report
              </h1>

              <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-slate-200">
                {address}
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Protecting Your Investment. One Inspection at a Time.
              </p>
            </div>
          </div>
        </section>

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
              href={`/client-portal/${inspectionId}`}
              className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-500/10"
            >
              Client Portal
            </Link>

            <Link
              href={`/reports/${inspectionId}`}
              className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              Full Editable Report
            </Link>
          </div>

          <section className="rounded-2xl border border-slate-700 bg-[#071224] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Report Ready
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  Inspection Overview
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  This report includes inspection information, limitations,
                  disclaimers, section reference photos, and documented findings.
                  Reference photos are documentation only and are not counted as defects.
                </p>
              </div>

              <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-6 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">
                  Total Defects
                </p>
                <p className="mt-1 text-5xl font-black text-white">
                  {defectTotals.total}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DefectSummaryCard
                label="Safety / Major"
                value={defectTotals.safety}
                tone="red"
                href={`/share/${inspectionId}?defect_filter=safety#inspection-findings`}
                active={activeDefectFilter === "safety"}
              />
              <DefectSummaryCard
                label="Recommended Repair"
                value={defectTotals.repair}
                tone="teal"
                href={`/share/${inspectionId}?defect_filter=repair#inspection-findings`}
                active={activeDefectFilter === "repair"}
              />
              <DefectSummaryCard
                label="Maintenance / Monitor"
                value={defectTotals.maintenance}
                tone="yellow"
                href={`/share/${inspectionId}?defect_filter=maintenance#inspection-findings`}
                active={activeDefectFilter === "maintenance"}
              />
              <DefectSummaryCard
                label="Informational"
                value={defectTotals.information}
                tone="blue"
                href={`/share/${inspectionId}?defect_filter=information#inspection-findings`}
                active={activeDefectFilter === "information"}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>Click a defect type above to filter the findings list.</span>
              {activeDefectFilter !== "all" && (
                <Link
                  href={`/share/${inspectionId}#inspection-findings`}
                  className="rounded-full border border-slate-600 px-3 py-1 font-bold text-white hover:bg-slate-800"
                >
                  Clear filter: {activeDefectFilterLabel[activeDefectFilter]}
                </Link>
              )}
            </div>
          </section>

          {inspection.executive_summary && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6 shadow-xl">
              <h2 className="text-2xl font-extrabold text-purple-300">
                Executive Summary
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                This client-friendly overview summarizes the report findings in plain language.
              </p>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
                {inspection.executive_summary}
              </div>
            </section>
          )}

          <details className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-teal-400">
                    Property Information
                  </h2>

                  <p className="mt-2 text-sm text-slate-400">
                    Click to expand property details and inspection information.
                  </p>
                </div>

                <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
                  Click to Expand
                </span>
              </div>
            </summary>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Info label="Property" value={address} />
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
          </details>

          {equipmentInventory.length > 0 && (
            <details
              id="equipment-inventory"
              className="mt-8 rounded-2xl border border-cyan-500/40 bg-[#071224] p-6"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-cyan-300">
                      Equipment Inventory
                    </h2>

                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand major systems and equipment documented during the inspection. These records are informational and are not counted as defects unless a separate finding is included.
                    </p>
                  </div>

                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200">
                    {equipmentInventory.length} record{equipmentInventory.length === 1 ? "" : "s"}
                  </span>
                </div>
              </summary>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {equipmentInventory.map((item: any) => {
                  const equipmentImage =
                    item.signed_image_url || item.image_url || item.public_url || "";

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-700 bg-[#0f172a] p-4"
                    >
                      {equipmentImage && (
                        <img
                          src={equipmentImage}
                          alt={item.equipment_type || "Equipment"}
                          loading="lazy"
                          decoding="async"
                          className="mb-4 max-h-56 w-full rounded-xl border border-slate-700 object-contain"
                        />
                      )}

                      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
                        {item.equipment_type || "Equipment"}
                      </p>

                      <h3 className="mt-2 text-xl font-black text-white">
                        {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Equipment Record"}
                      </h3>

                      <div className="mt-4 grid gap-2 text-sm text-slate-300">
                        <InventoryLine label="Serial" value={item.serial} />
                        <InventoryLine label="Manufacture Year" value={item.manufacture_year} />
                        <InventoryLine label="Estimated Age" value={item.estimated_age} />
                        <InventoryLine label="Expected Life" value={item.expected_service_life} />
                        <InventoryLine label="Life Remaining" value={item.estimated_life_remaining} />
                        <InventoryLine label="Refrigerant" value={item.refrigerant} />
                        <InventoryLine label="Condition" value={item.condition} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {showEnvironmentalLinks && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6">
              <h2 className="text-2xl font-bold text-purple-300">
                Official Environmental Reports
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                These links open the official third-party environmental reports from the lab or testing device.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {hasMoldService(inspection) && moldReportUrl && (
                  <a
                    href={moldReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500 bg-[#0f172a] p-5 font-bold text-purple-300 transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Mold Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-slate-400">
                      Open the official mold lab report.
                    </span>
                  </a>
                )}

                {hasRadonService(inspection) && radonReportUrl && (
                  <a
                    href={radonReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500 bg-[#0f172a] p-5 font-bold text-purple-300 transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Radon Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-slate-400">
                      Open the official radon device report.
                    </span>
                  </a>
                )}
              </div>
            </section>
          )}

          {(sectionStats.length > 0 || equipmentInventory.length > 0) && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <h2 className="text-2xl font-bold text-teal-400">
                Section Snapshot
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Quick overview of findings and reference photos by report section.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionStats.map((stat) => (
                  <a
                    key={stat.section}
                    href={`#section-${stat.section
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-4 transition hover:border-teal-500/60 hover:bg-[#102033]"
                  >
                    <p className="font-black text-white">{stat.section}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      {stat.defectCount} defect{stat.defectCount === 1 ? "" : "s"} •{" "}
                      {stat.referenceCount} reference photo
                      {stat.referenceCount === 1 ? "" : "s"}
                    </p>
                  </a>
                ))}

                {equipmentInventory.length > 0 && (
                  <a
                    href="#equipment-inventory"
                    className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 transition hover:border-cyan-400 hover:bg-cyan-500/20"
                  >
                    <p className="font-black text-cyan-200">
                      Equipment Inventory
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {equipmentInventory.length} equipment record
                      {equipmentInventory.length === 1 ? "" : "s"} • informational only
                    </p>
                  </a>
                )}
              </div>
            </section>
          )}

          {inspection.report_summary && (
            <details className="mt-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-teal-300">
                      Report Summary
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand the generated summary of notable findings and recommendations.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
                {inspection.report_summary}
              </div>
            </details>
          )}

          {Object.keys(checklistBySection).length > 0 && (
            <details className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-teal-400">
                      Inspection Information
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand selected inspection information, component types, materials, and system details.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 space-y-6">
                {SECTION_ORDER.filter((section) => checklistBySection[section]).map(
                  (section) => (
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
                                  .filter((value: string) => value !== "__TEXT_VALUE__")
                                  .join(", ") || "N/A"}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </details>
          )}

          {Object.keys(limitationsBySection).length > 0 && (
            <section className="mt-8 rounded-2xl border border-yellow-500/40 bg-[#071224] p-6">
              <h2 className="mb-5 text-2xl font-bold text-yellow-300">
                Limitations
              </h2>

              <div className="space-y-6">
                {SECTION_ORDER.filter((section) => limitationsBySection[section]).map(
                  (section) => (
                    <div
                      key={section}
                      className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                    >
                      <h3 className="mb-4 text-xl font-bold text-white">
                        {section}
                      </h3>

                      <div className="space-y-5">
                        {(limitationsBySection[section] || []).map((item: any) => (
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
                                    loading="lazy"
                                    decoding="async"
                                    className="max-h-[260px] w-full rounded-xl border border-slate-700 object-cover"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {reportDisclaimers && reportDisclaimers.length > 0 && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6">
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

          <section id="inspection-findings" className="mt-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Inspection Findings
                </p>
                <h2 className="mt-2 text-4xl font-black text-white">
                  Findings By Section
                </h2>
                {activeDefectFilter !== "all" && (
                  <p className="mt-2 text-sm font-semibold text-teal-300">
                    Showing: {activeDefectFilterLabel[activeDefectFilter]} only
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700 bg-[#071224] px-5 py-3 text-sm text-slate-300">
                {activeDefectFilter === "all"
                  ? `${defectTotals.total} total defect${defectTotals.total === 1 ? "" : "s"} documented`
                  : `${displayFindings.filter(isReportDefect).length} ${activeDefectFilterLabel[activeDefectFilter].toLowerCase()} finding${displayFindings.filter(isReportDefect).length === 1 ? "" : "s"}`}
              </div>
            </div>

            {groupedFindings.length === 0 ? (
              <div className="rounded-2xl border border-slate-700 bg-[#071224] p-8 text-center text-slate-300">
                No findings saved yet.
              </div>
            ) : (
              <div className="space-y-8">
                {groupedFindings.map((group) => {
                  const sectionDefects = group.findings.filter(isReportDefect).length;

                  return (
                    <section
                      key={group.section}
                      id={`section-${group.section
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")}`}
                      className="rounded-2xl border border-slate-700 bg-[#071224] p-6"
                    >
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
                        <h3 className="text-2xl font-black text-white">
                          {group.section}
                        </h3>

                        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-300">
                          {sectionDefects} defect{sectionDefects === 1 ? "" : "s"}
                        </span>
                      </div>

                      {referencePhotosBySection[group.section]?.length > 0 && (
                        <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                          <h4 className="mb-3 text-lg font-bold text-cyan-300">
                            Section Reference Photos
                          </h4>

                          <p className="mb-4 text-sm text-slate-400">
                            These photos document general section conditions and are not defect findings.
                          </p>

                          <div className="grid gap-4 md:grid-cols-3">
                            {referencePhotosBySection[group.section].map((photo: any, index: number) => {
                              const photoUrl = photo.signed_url || photo.public_url || "";

                              if (!photoUrl) return null;

                              return (
                                <div
                                  key={photo.id || index}
                                  className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617]"
                                >
                                  <img
                                    src={photoUrl}
                                    alt={photo.caption || `Section reference photo ${index + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                    className="max-h-[280px] w-full object-cover"
                                  />

                                  {photo.caption && (
                                    <p className="border-t border-slate-800 px-3 py-2 text-sm text-slate-300">
                                      {photo.caption}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {group.findings.length === 0 && (
                        <div className="rounded-xl border border-slate-700 bg-[#020617]/70 p-5 text-slate-300">
                          No defect findings documented in this section.
                        </div>
                      )}

                      <div className="space-y-3 md:space-y-6">
                        {group.findings.map((finding: any) => {
                          const firstPhoto = (finding.photos || [])[0];
                          const image = getFindingPhotoUrl(finding);
                          const title = getFindingTitle(finding);
                          const summary = getFindingSummary(finding);
                          const isVideo = isVideoMedia(firstPhoto || finding, image);

                          return (
                            <div key={finding.id}>
                              <details className="group overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl md:hidden">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex gap-3 p-3">
                                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-[#020617]">
                                      {image ? (
                                        isVideo ? (
                                          <div className="relative h-full w-full bg-black">
                                            <video
                                              src={image}
                                              muted
                                              playsInline
                                              preload="metadata"
                                              className="h-full w-full object-cover opacity-80"
                                            />
                                            <span className="absolute inset-x-2 bottom-2 rounded-full border border-cyan-400 bg-black/75 px-2 py-1 text-center text-[10px] font-black uppercase tracking-wide text-cyan-300">
                                              Video
                                            </span>
                                          </div>
                                        ) : (
                                          <img
                                            src={image}
                                            alt={title}
                                            loading="lazy"
                                            decoding="async"
                                            className="h-full w-full object-cover"
                                          />
                                        )
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-500">
                                          No Photo
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span
                                          className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getSeverityClass(
                                            finding.severity
                                          )}`}
                                        >
                                          {finding.severity || "Recommended Repair"}
                                        </span>
                                      </div>

                                      <h4 className="line-clamp-2 break-words text-base font-black leading-tight text-white">
                                        {title}
                                      </h4>

                                      <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-teal-300">
                                        {finding.section}
                                      </p>

                                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                                        {summary}
                                      </p>

                                      <p className="mt-2 text-xs font-black text-cyan-300">
                                        View Finding →
                                      </p>
                                    </div>
                                  </div>
                                </summary>

                                <div className="border-t border-slate-700 p-4">
                                  {image && (
                                    isVideo ? (
                                      <video
                                        src={image}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="mb-4 max-h-[360px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                                      />
                                    ) : (
                                      <img
                                        src={image}
                                        alt="Inspection finding"
                                        loading="lazy"
                                        decoding="async"
                                        className="mb-4 max-h-[360px] w-full rounded-xl border border-slate-700 object-contain"
                                      />
                                    )
                                  )}

                                  <div className="grid gap-3">
                                    <FindingTextCard
                                      title="Observation"
                                      value={finding.observation}
                                      tone="blue"
                                    />

                                    <FindingTextCard
                                      title="Implication"
                                      value={finding.implication}
                                      tone="yellow"
                                    />

                                    <FindingTextCard
                                      title="Recommendation"
                                      value={finding.recommendation}
                                      tone="teal"
                                    />

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </details>

                              <article className="hidden overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl md:block">
                                <div className="border-b border-slate-700 bg-[#020817] p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {finding.section}
                                      </p>

                                      <h4 className="mt-1 text-2xl font-black text-teal-300">
                                        {title}
                                      </h4>
                                    </div>

                                    <span
                                      className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${getSeverityClass(
                                        finding.severity
                                      )}`}
                                    >
                                      {finding.severity || "Recommended Repair"}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-5">
                                  {image && (
                                    isVideo ? (
                                      <video
                                        src={image}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="mb-5 max-h-[520px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                                      />
                                    ) : (
                                      <img
                                        src={image}
                                        alt="Inspection finding"
                                        loading="lazy"
                                        decoding="async"
                                        className="mb-5 max-h-[520px] w-full rounded-xl border border-slate-700 object-contain"
                                      />
                                    )
                                  )}

                                  <div className="grid gap-4">
                                    <FindingTextCard
                                      title="Observation"
                                      value={finding.observation}
                                      tone="blue"
                                    />

                                    <FindingTextCard
                                      title="Implication"
                                      value={finding.implication}
                                      tone="yellow"
                                    />

                                    <FindingTextCard
                                      title="Recommendation"
                                      value={finding.recommendation}
                                      tone="teal"
                                    />

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </article>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
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

function DefectSummaryCard({
  label,
  value,
  tone,
  href,
  active = false,
}: {
  label: string;
  value: number;
  tone: "red" | "teal" | "yellow" | "blue";
  href: string;
  active?: boolean;
}) {
  const color =
    tone === "red"
      ? "text-red-300 border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
      : tone === "yellow"
      ? "text-yellow-300 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20"
      : tone === "blue"
      ? "text-blue-300 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20"
      : "text-teal-300 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20";

  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 text-center transition ${color} ${
        active ? "ring-2 ring-white/70" : ""
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">
        Click to filter
      </p>
    </Link>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!value) return null;

  return (
    <div className="flex justify-between gap-3 border-b border-slate-800 pb-1">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function FindingTextCard({
  title,
  value,
  tone,
}: {
  title: string;
  value?: any;
  tone: "blue" | "yellow" | "teal" | "slate";
}) {
  if (!value) return null;

  const classes =
    tone === "blue"
      ? "border-blue-500/30 bg-blue-500/10"
      : tone === "yellow"
      ? "border-yellow-500/30 bg-yellow-500/10"
      : tone === "teal"
      ? "border-teal-500/30 bg-teal-500/10"
      : "border-slate-700 bg-[#020817]";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-sm font-black uppercase tracking-wide text-white">
        {title}
      </p>

      <p className="mt-2 whitespace-pre-line text-base leading-7 text-slate-200">
        {value}
      </p>
    </div>
  );
}
