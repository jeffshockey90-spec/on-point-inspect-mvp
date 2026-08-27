import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveReportSections } from "../../../../lib/reportSections";
import { getCompanyBrandingById } from "../../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

import PrintControls from "./PrintControls";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

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

// Matches the identical numbering scheme used by the report builder
// (app/reports/[id]/page.tsx) and the client-facing share page
// (app/share/[id]/page.tsx) - this used to be a separate, differently
// grouped algorithm (grouped by matching title text, always recomputed),
// which caused the PDF's item numbers to disagree with the report.
function getRepairNumberTitle(finding: any) {
  const rawTitle = String(
    finding?.title ||
      finding?.finding_title ||
      finding?.defect_title ||
      finding?.name ||
      "Untitled Finding"
  ).trim();

  return rawTitle.replace(/^\d+\.\d+\.\d+\s*[-–—:]\s*/g, "");
}

function getRepairItemGroupLabel(finding: any) {
  return String(
    finding?.component ||
      finding?.subsection ||
      finding?.category ||
      finding?.system ||
      finding?.group_title ||
      finding?.item_group ||
      "General"
  ).trim() || "General";
}

function buildFindingItemNumbers(findings: any[], sectionOrder: string[] = SECTION_ORDER) {
  const sectionGroupMap = new Map<string, number>();
  const sectionGroupCounts = new Map<string, number>();

  return (findings || []).map((finding: any) => {
    const section = normalizeSection(finding?.section);
    const sectionNumberRaw = sectionOrder.indexOf(section) + 1;
    const sectionNumber = sectionNumberRaw > 0 ? sectionNumberRaw : sectionOrder.length + 1;
    const groupLabel = getRepairItemGroupLabel(finding).toLowerCase();
    const sectionGroupKey = `${sectionNumber}:${groupLabel}`;

    if (!sectionGroupMap.has(sectionGroupKey)) {
      const existingGroupsForSection = Array.from(sectionGroupMap.keys()).filter((key) =>
        key.startsWith(`${sectionNumber}:`)
      ).length;

      sectionGroupMap.set(sectionGroupKey, existingGroupsForSection + 1);
    }

    const groupNumber = sectionGroupMap.get(sectionGroupKey) || 1;
    const countKey = `${sectionNumber}.${groupNumber}`;
    const nextCount = (sectionGroupCounts.get(countKey) || 0) + 1;
    sectionGroupCounts.set(countKey, nextCount);

    const repairItemNumber =
      finding?.repair_item_number ||
      finding?.item_number ||
      finding?.finding_number ||
      `${sectionNumber}.${groupNumber}.${nextCount}`;

    return {
      ...finding,
      section,
      original_title: getRepairNumberTitle(finding),
      report_item_number: repairItemNumber,
    };
  });
}

function getFindingItemNumber(finding: any) {
  return String(finding?.report_item_number || finding?.item_number || finding?.repair_item_number || "").trim();
}

function isVideoPhoto(photo: any) {
  const type = String(
    photo?.mime_type || photo?.media_type || photo?.content_type || "",
  ).toLowerCase();
  const path = String(
    photo?.file_path || photo?.storage_path || photo?.photo_path || "",
  ).toLowerCase();
  const url = String(photo?.signed_url || photo?.public_url || "").toLowerCase();
  return (
    Boolean(photo?.is_video) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    /\.(mp4|mov|m4v|webm|avi)(\?|#|$)/.test(path) ||
    /\.(mp4|mov|m4v|webm|avi)(\?|#|$)/.test(url)
  );
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(url.substring(index + marker.length));
}

function getSeverityClass(severity: string | null | undefined) {
  const value = String(severity || "").toLowerCase();

  if (
    value.includes("safety") ||
    value.includes("hazard") ||
    value.includes("major")
  ) {
    return "bg-red-700 text-white border-red-800";
  }

  if (
    value.includes("maintenance") ||
    value.includes("monitor") ||
    value.includes("minor")
  ) {
    return "bg-yellow-500 text-slate-950 border-yellow-600";
  }

  if (
    value.includes("information") ||
    value.includes("info") ||
    value.includes("client")
  ) {
    return "bg-blue-700 text-white border-blue-800";
  }

  return "bg-teal-700 text-white border-teal-800";
}


function groupChecklistRows(rows: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  (rows || []).forEach((row: any) => {
    if (!grouped[row.section]) grouped[row.section] = {};
    if (!grouped[row.section][row.group_title]) grouped[row.section][row.group_title] = [];
    grouped[row.section][row.group_title].push(row);
  });

  return grouped;
}

function groupLimitations(rows: any[], photosByLimitationId: Record<string, any[]>) {
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

async function createSignedUrlMap(supabase: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const chunkSize = 50;

  for (let index = 0; index < uniquePaths.length; index += chunkSize) {
    const chunk = uniquePaths.slice(index, index + chunkSize);

    const { data, error } = await supabase.storage
      .from("inspection-photos")
      .createSignedUrls(chunk, 60 * 60 * 24 * 7);

    if (error) {
      console.error("Batch signed photo URL error:", error);
      continue;
    }

    (data || []).forEach((item: any, itemIndex: number) => {
      const path = item?.path || chunk[itemIndex];

      if (path && item?.signedUrl) {
        signedMap[path] = item.signedUrl;
      }
    });
  }

  return signedMap;
}

function getPhotoFilePath(photo: any) {
  return (
    photo.file_path ||
    photo.storage_path ||
    photo.photo_path ||
    getStoragePathFromUrl(photo.public_url) ||
    getStoragePathFromUrl(photo.image_url) ||
    getStoragePathFromUrl(photo.photo_url) ||
    ""
  );
}


function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

function getTypicalIndustryRange(value: any) {
  const clean = String(value || "").trim();
  if (!isKnownEquipmentValue(clean)) return "";

  const rangeMatch = clean.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return `${rangeMatch[1]}–${rangeMatch[2]} years`;
  }

  const numberMatch = clean.match(/\d+/);
  if (!numberMatch) return clean;

  const upper = Number(numberMatch[0]);
  if (!Number.isFinite(upper) || upper <= 0) return clean;

  const lower = Math.max(1, upper - 5);
  return `${lower}–${upper} years`;
}

function getEquipmentConditionNote(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!isKnownEquipmentValue(clean)) return "";

  if (
    lower.includes("remaining") ||
    lower.includes("service life") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  return clean;
}

function getEquipmentInspectorNote(item: any) {
  return (
    item?.inspector_note ||
    item?.inspection_note ||
    item?.note ||
    item?.notes ||
    ""
  );
}

function getEquipmentMaintenanceNote(item: any) {
  return (
    item?.maintenance_note ||
    item?.maintenance ||
    item?.service_note ||
    ""
  );
}

// Percent of typical service life already used (age / max service life).
// 0 means age could not be determined, so hide it rather than printing a
// misleading "0%" on the client's report.
function getEquipmentLifeUsed(item: any) {
  const num = Number(item?.life_expectancy_percent);
  if (!Number.isFinite(num) || num <= 0) return "";
  const capped = Math.min(Math.round(num), 150);
  return `About ${capped}% of typical service life`;
}

// Generic, low-risk maintenance cadence for the equipment category.
function getEquipmentMaintenanceSchedule(item: any) {
  const value =
    item?.maintenance_schedule || item?.recommended_maintenance || "";
  const clean = String(value).trim();
  return isKnownEquipmentValue(clean) ? clean : "";
}


function PrintEquipmentNoteBlock({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  const clean = String(value || "").trim();

  if (!isKnownEquipmentValue(clean)) return null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-cyan-800">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-800">
        {clean}
      </p>
    </div>
  );
}


function getEquipmentStatusValue(item: any) {
  const explicit =
    item?.equipment_status ||
    item?.equipmentStatus ||
    item?.status ||
    "";

  if (isKnownEquipmentValue(explicit)) return explicit;

  const condition = String(item?.condition || "").toLowerCase();
  const severity = String(item?.severity || "").toLowerCase();

  if (
    condition.includes("beyond") ||
    condition.includes("near end") ||
    severity.includes("repair") ||
    severity.includes("monitor")
  ) {
    return "⚠ Monitor / Budget for Replacement";
  }

  if (condition.includes("service") || condition.includes("repair")) {
    return "⚠ Service Recommended";
  }

  return "✓ No Specific Deficiency Noted";
}


function isHvacEquipmentItem(item: any) {
  const text = [
    item?.equipment_type,
    item?.equipmentType,
    item?.section,
    item?.manufacturer,
    item?.model,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("heat pump") ||
    text.includes("air handler") ||
    text.includes("condenser") ||
    text.includes("air conditioner") ||
    text.includes("ac condenser") ||
    text.includes("cooling") ||
    text.includes("furnace") ||
    text.includes("hvac")
  );
}

export default async function PrintableReportPage({ params }: PageProps) {
  const { id: shareLookup } = await params;
  const supabase = await createSupabaseServerClient();

  // Two ways in: (1) a client/realtor opening this from a public share
  // token (no login - matches /share, /client-portal, /environmental-share),
  // or (2) the inspector opening their own report by numeric id while
  // logged in. Published-only RLS covers the token path; ownership covers
  // the inspector path.
  const { data: inspectionByToken } = await supabase
    .from("inspections")
    .select("*")
    .eq("public_share_token", shareLookup)
    .eq("published", true)
    .maybeSingle();

  let inspection = inspectionByToken;

  // Legacy fallback: reports published before share tokens existed on every
  // row won't match above. Still safe - restricted to published reports
  // only, same condition the public RLS policy itself enforces.
  if (!inspection && /^\d+$/.test(shareLookup)) {
    const { data: inspectionByPublishedId } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", shareLookup)
      .eq("published", true)
      .maybeSingle();

    inspection = inspectionByPublishedId;
  }

  if (!inspection) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspectionByOwner, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", shareLookup)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (inspectionError || !inspectionByOwner) redirect("/reports");

    inspection = inspectionByOwner;
  }

  const branding = await getCompanyBrandingById(inspection.company_id);

  // Use the current Client / Co-Client contact records as the report source
  // of truth. This prevents an old placeholder such as "Test" stored on the
  // inspections row from continuing to appear in the PDF.
  const { data: reportClientContactsRaw, error: reportClientContactsError } =
    await supabase
      .from("inspection_contacts")
      .select("id, name, email, role, created_at")
      .eq("inspection_id", inspection.id)
      .order("created_at", { ascending: true });

  if (reportClientContactsError) {
    console.error(
      "Printable report client contacts load error:",
      reportClientContactsError,
    );
  }

  const reportClientContacts = (reportClientContactsRaw || []).filter(
    (contact: any) => {
      const role = String(contact?.role || "").trim().toLowerCase();
      return role === "client" || role === "co-client" || role.includes("client");
    },
  );

  const cleanClientNames = Array.from(
    new Set(
      reportClientContacts
        .map((contact: any) => String(contact?.name || "").trim())
        .filter(
          (name: string) =>
            Boolean(name) &&
            !["test", "client test", "test client"].includes(name.toLowerCase()),
        ),
    ),
  );

  const cleanClientEmails = Array.from(
    new Set(
      reportClientContacts
        .map((contact: any) => String(contact?.email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const printableClientName =
    cleanClientNames.join(" & ") ||
    String(inspection.client_name || inspection.client || "N/A").trim() ||
    "N/A";

  const printableClientEmail =
    cleanClientEmails.join(", ") ||
    String(inspection.client_email || "N/A").trim() ||
    "N/A";

  const { data: findingsRaw } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const { data: reportSectionsRaw } = await supabase
    .from("report_section_overrides")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("sort_order", { ascending: true });

  const { data: sectionNotesRaw } = await supabase
    .from("report_section_notes")
    .select("section_name, notes")
    .eq("inspection_id", inspection.id);

  const notesBySection: Record<string, string> = {};
  for (const row of sectionNotesRaw || []) {
    if (row?.section_name && String(row.notes || "").trim()) {
      notesBySection[row.section_name] = row.notes;
    }
  }

  const activeSectionOrder = resolveReportSections({
    overrides: reportSectionsRaw || [],
    customOrder: (inspection as any).report_section_order,
    serviceMode: inspection.service_mode,
    templateSections: (inspection as any).template_sections,
  });

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  // Page past Supabase's 1000-row cap so photo-heavy inspections don't lose media.
  let photosRaw: any[] = [];
  if (findingIds.length > 0) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("photos")
        .select("*")
        .in("finding_id", findingIds)
        // photos has no sort_order column; ordering by it 400s and drops
        // every photo/video from the PDF. Order by created_at only.
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      photosRaw = photosRaw.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
  }

  const photoSignedUrlMap = await createSignedUrlMap(
    supabase,
    (photosRaw || []).map((photo: any) => getPhotoFilePath(photo))
  );

  const photosWithUrls = (photosRaw || []).map((photo: any) => {
    const filePath = getPhotoFilePath(photo);

    return {
      ...photo,
      signed_url:
        (filePath && photoSignedUrlMap[filePath]) ||
        photo.signed_url ||
        photo.public_url ||
        photo.image_url ||
        photo.photo_url ||
        null,
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

  const findingImageSignedUrlMap = await createSignedUrlMap(
    supabase,
    (findingsRaw || []).map((finding: any) => getStoragePathFromUrl(finding.image_url))
  );

  const findings = (findingsRaw || []).map((finding: any) => {
    const oldImagePath = getStoragePathFromUrl(finding.image_url);
    const signedImageUrl =
      (oldImagePath && findingImageSignedUrlMap[oldImagePath]) || finding.image_url || "";

    return {
      ...finding,
      section: normalizeSection(finding.section),
      image_url: signedImageUrl || finding.image_url || null,
      photos: photosByFindingId[finding.id] || [],
    };
  });


  const { data: checklistRows } = await supabase
    .from("section_checklist_selections")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const { data: limitationRows } = await supabase
    .from("section_limitations")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const limitationIds = (limitationRows || []).map((item: any) => item.id);

  const { data: limitationPhotosRaw } =
    limitationIds.length > 0
      ? await supabase
          .from("limitation_photos")
          .select("*")
          .in("limitation_id", limitationIds)
      : { data: [] };

  // limitation_photos has no file_path column (unlike section_reference_photos
  // below), and the inspection-photos bucket is private, so its stored
  // photo_url/thumbnail_url values 404 if used directly - derive the real
  // storage path from the URL and sign it, same as every other photo table.
  const limitationPhotoStoragePaths = (limitationPhotosRaw || []).map((photo: any) =>
    getStoragePathFromUrl(photo.thumbnail_url || photo.photo_url)
  );

  const limitationPhotoSignedUrlMap = await createSignedUrlMap(
    supabase,
    limitationPhotoStoragePaths
  );

  const limitationPhotosWithUrls = (limitationPhotosRaw || []).map((photo: any) => {
    const storagePath = getStoragePathFromUrl(photo.thumbnail_url || photo.photo_url);

    return {
      ...photo,
      signed_url:
        (storagePath && limitationPhotoSignedUrlMap[storagePath]) ||
        photo.thumbnail_url ||
        photo.photo_url ||
        "",
    };
  });

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
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const referencePhotoSignedUrlMap = await createSignedUrlMap(
    supabase,
    (sectionReferencePhotosRaw || []).map((photo: any) => photo.file_path)
  );

  const sectionReferencePhotos = (sectionReferencePhotosRaw || []).map((photo: any) => ({
    ...photo,
    signed_url:
      (photo.file_path && referencePhotoSignedUrlMap[photo.file_path]) ||
      photo.public_url ||
      "",
  }));

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
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  const { data: equipmentInventoryRaw, error: equipmentInventoryError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  if (equipmentInventoryError) {
    console.error("Print equipment inventory load error:", equipmentInventoryError);
  }

  const equipmentSignedUrlMap = await createSignedUrlMap(
    supabase,
    (equipmentInventoryRaw || []).map((item: any) => item.file_path)
  );

  const equipmentInventory = (equipmentInventoryRaw || []).map((item: any) => ({
    ...item,
    signed_image_url:
      (item.file_path && equipmentSignedUrlMap[item.file_path]) ||
      item.image_url ||
      "",
  }));

  const numberedFindings = buildFindingItemNumbers(findings, activeSectionOrder);

  const defectFindings = numberedFindings.filter((finding: any) => {
    const section = String(finding.section || "").toLowerCase();
    const title = String(finding.title || "").toLowerCase();

    if (section === "inspection details") return false;
    if (section === "disclaimers") return false;
    if (title === "in attendance") return false;
    if (title === "occupancy") return false;
    if (title === "style") return false;
    if (title === "temperature") return false;
    if (title === "type of building") return false;
    if (title === "weather conditions") return false;
    if (title.includes("section reference photo")) return false;
    if (title.includes("reference photo")) return false;

    return true;
  });

  const defectTotals = defectFindings.reduce(
    (acc: Record<string, number>, finding: any) => {
      const severity = String(
        finding.severity || "Recommended Repair"
      ).toLowerCase();

      acc.total += 1;

      if (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      ) {
        acc.safety += 1;
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
    }
  );

  const groupedFindingsArray = activeSectionOrder.map((section) => ({
    section,
    findings: numberedFindings.filter((finding: any) => finding.section === section),
  }));

  // Mirror the share page: findings whose (normalized) section is no longer in
  // the active section list - e.g. tagged to a deleted or service-mode-hidden
  // section - would otherwise silently vanish from the printed report. Bucket
  // them into "Other" so they still print, appended after the normal sections.
  const otherFindings = numberedFindings.filter(
    (finding: any) => !activeSectionOrder.includes(finding.section),
  );

  if (otherFindings.length > 0) {
    groupedFindingsArray.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  const propertyPhoto =
    inspection.property_image ||
    inspection.street_view_url ||
    inspection.cover_photo_url ||
    inspection.google_photo_url ||
    inspection.property_photo_url ||
    inspection.place_photo_url ||
    inspection.photo_url ||
    inspection.image_url ||
    null;

  return (
    <main className="min-h-screen bg-white text-slate-950 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page-break {
            page-break-before: always;
          }

          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .section-print-block {
            break-inside: auto;
            page-break-inside: auto;
          }

          .finding-card-print {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 0.22in;
          }

          .finding-photo-print {
            max-height: 3.1in !important;
            object-fit: contain !important;
            background: #ffffff;
          }

          .print-footer {
            position: fixed;
            bottom: 0.15in;
            left: 0.5in;
            right: 0.5in;
          }
        }
      `}</style>

      <div className="mx-auto max-w-5xl p-8 print:max-w-none print:p-0">
        <PrintControls inspectionId={String(inspection.id)} />

        <section className="avoid-break min-h-[900px] overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm print:min-h-[9.5in] print:rounded-none print:border-0 print:shadow-none">
          {propertyPhoto && (
            <img
              src={propertyPhoto}
              alt="Property" loading="eager" decoding="async" fetchPriority="high"
                              className="h-80 w-full object-cover print:h-72"
            />
          )}

          <div className="bg-slate-950 p-8 text-white">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-300">
                  Residential Home Inspection Report
                </p>

                <h1 className="mt-4 text-5xl font-black tracking-tight">
                  {branding.name}
                </h1>

                <p className="mt-3 text-lg font-semibold text-slate-300">
                  {branding.tagline}
                </p>
              </div>

              <div className="rounded-2xl border border-teal-400/40 bg-white/10 p-4 text-right">
                <p className="text-sm font-bold text-teal-300">
                  Licensed Home Inspector
                </p>
                {branding.licenseInfo && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-200">
                    {branding.licenseInfo}
                  </p>
                )}
                {branding.phone && (
                  <p className="mt-2 text-sm text-slate-200">
                    {branding.phone}
                  </p>
                )}
                {(branding.website || branding.email) && (
                  <p className="text-sm text-slate-200">
                    {branding.website || branding.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-8 md:grid-cols-2">
            <InfoRow label="Property Address" value={inspection.address} />
            <InfoRow label="Client" value={printableClientName} />
            {inspection.client_organization_name && (
              <InfoRow label="Business/Organization" value={inspection.client_organization_name} />
            )}
            <InfoRow label="Client Email" value={printableClientEmail} />
            <InfoRow label="Realtor" value={inspection.realtor_name} />
            <InfoRow label="Inspection Date" value={inspection.inspection_date} />
            <InfoRow label="Square Feet" value={inspection.square_feet} />
            <InfoRow label="Year Built" value={inspection.year_built} />
            <InfoRow
              label="City / State / Zip"
              value={`${inspection.city || ""} ${inspection.state || ""} ${
                inspection.zip || ""
              }`}
            />
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-slate-300 bg-slate-50 p-6">
            <h2 className="text-2xl font-black text-slate-950">
              Report Overview
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DefectCountCard label="Total" value={defectTotals.total} />
              <DefectCountCard
                label="Safety / Major"
                value={defectTotals.safety}
              />
              <DefectCountCard label="Repair" value={defectTotals.repair} />
              <DefectCountCard
                label="Maintenance"
                value={defectTotals.maintenance}
              />
              <DefectCountCard
                label="Informational"
                value={defectTotals.information}
              />
            </div>
          </div>
        </section>

        {equipmentInventory.length > 0 && (
          <section
            id="equipment-inventory"
            className="avoid-break page-break rounded-2xl border border-cyan-200 bg-cyan-50 p-6"
          >
            <h2 className="text-3xl font-black text-cyan-800">
              Equipment Inventory
            </h2>

            <p className="mt-3 text-base leading-7 text-slate-700">
              Major systems and equipment documented during the inspection. These records are informational and are not counted as defects unless a separate finding is included.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {equipmentInventory.map((item: any) => {
                const equipmentImage =
                  item.signed_image_url || item.image_url || item.public_url || "";

                return (
                  <div
                    key={item.id}
                    className="avoid-break rounded-xl border border-slate-300 bg-white p-5"
                  >
                    {equipmentImage && (
                      <img
                        src={equipmentImage}
                        alt={item.equipment_type || "Equipment"}
                              className="mb-4 max-h-[260px] w-full rounded-xl border border-slate-300 object-contain"
                      />
                    )}

                    <p className="text-xs font-black uppercase tracking-wide text-cyan-700">
                      {item.equipment_type || "Equipment"}
                    </p>

                    <h3 className="mt-2 text-2xl font-black text-slate-950">
                      {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Equipment Record"}
                    </h3>

                    <div className="mt-4 grid gap-2 text-base text-slate-700">
                      <InventoryLine label="Equipment Status" value={getEquipmentStatusValue(item)} />
                      <InventoryLine label="Serial" value={item.serial} />
                      <InventoryLine label="Manufacture Year" value={item.manufacture_year} />
                      <InventoryLine label="Estimated Age" value={item.estimated_age} />
                      <InventoryLine label="Typical Industry Range" value={getTypicalIndustryRange(item.expected_service_life)} />
                      <InventoryLine label="Service Life" value={getTypicalIndustryRange(item.expected_service_life) ? "Industry estimate only" : ""} />
                      <InventoryLine label="Capacity" value={item.capacity} />
                      <InventoryLine label="Fuel Type" value={item.fuel_type} />
                      {isHvacEquipmentItem(item) && <InventoryLine label="Refrigerant" value={item.refrigerant} />}
                      <InventoryLine label="Condition" value={getEquipmentConditionNote(item.condition)} />
                      <InventoryLine label="Estimated Life Used" value={getEquipmentLifeUsed(item)} />
                    </div>

                    <PrintEquipmentNoteBlock
                      label="Inspector Note"
                      value={getEquipmentInspectorNote(item)}
                    />

                    <PrintEquipmentNoteBlock
                      label="Maintenance Note"
                      value={getEquipmentMaintenanceNote(item)}
                    />

                    <PrintEquipmentNoteBlock
                      label="Recommended Maintenance"
                      value={getEquipmentMaintenanceSchedule(item)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {inspection.report_summary && (
          <section className="avoid-break page-break rounded-2xl border border-teal-200 bg-teal-50 p-6">
            <h2 className="text-3xl font-black text-teal-800">
              Realtor Summary
            </h2>

            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-800">
              {inspection.report_summary}
            </p>
          </section>
        )}


        {Object.keys(checklistBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-slate-300 bg-white p-6">
            <h2 className="text-3xl font-black text-slate-950">
              Inspection Information
            </h2>

            <div className="mt-6 space-y-6">
              {activeSectionOrder.filter((section) => checklistBySection[section]).map(
                (section) => (
                  <div key={section} className="avoid-break rounded-xl border border-slate-300 p-5">
                    <h3 className="mb-4 text-2xl font-black text-teal-800">
                      {section}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(checklistBySection[section]).map(
                        ([groupTitle, rows]: any) => (
                          <div key={groupTitle}>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                              {groupTitle}
                            </p>

                            <p className="mt-1 text-base font-semibold text-slate-800">
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
          </section>
        )}

        {Object.keys(limitationsBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-yellow-300 bg-yellow-50 p-6">
            <h2 className="text-3xl font-black text-yellow-800">
              Limitations
            </h2>

            <div className="mt-6 space-y-6">
              {activeSectionOrder.filter((section) => limitationsBySection[section]).map(
                (section) => (
                  <div key={section} className="avoid-break rounded-xl border border-slate-300 bg-white p-5">
                    <h3 className="mb-4 text-2xl font-black text-slate-950">
                      {section}
                    </h3>

                    <div className="space-y-5">
                      {(limitationsBySection[section] || []).map((item: any) => (
                        <div key={item.id} className="avoid-break rounded-xl border border-slate-300 p-4">
                          <p className="font-black text-yellow-800">
                            {item.custom_text || item.label}
                          </p>

                          {item.limitation_comment && (
                            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-700">
                              {item.limitation_comment}
                            </p>
                          )}

                          {item.photos?.length > 0 && (
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                              {item.photos.map((photo: any) => (
                                <img
                                  key={photo.id}
                                  src={photo.signed_url || photo.public_url}
                                  alt="Limitation photo" loading="lazy" decoding="async" fetchPriority="low"
                              className="max-h-[260px] w-full rounded-xl border object-cover"
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

        {Object.keys(referencePhotosBySection).length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
            <h2 className="text-3xl font-black text-cyan-800">
              Section Reference Photos
            </h2>

            <p className="mt-3 text-base leading-7 text-slate-700">
              These photos document general section conditions and are not defect findings.
            </p>

            <div className="mt-6 space-y-6">
              {activeSectionOrder.filter((section) => referencePhotosBySection[section]).map(
                (section) => (
                  <div
                    key={section}
                    className="avoid-break rounded-xl border border-slate-300 bg-white p-5"
                  >
                    <h3 className="mb-4 text-2xl font-black text-slate-950">
                      {section}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-3">
                      {referencePhotosBySection[section].map((photo: any, index: number) => {
                        const photoUrl = photo.signed_url || photo.public_url || "";

                        if (!photoUrl) return null;

                        return (
                          <div
                            key={photo.id || index}
                            className="avoid-break overflow-hidden rounded-xl border border-slate-300 bg-white"
                          >
                            <img
                              src={photoUrl}
                              alt={photo.caption || `Section reference photo ${index + 1}`}
                              className="max-h-[280px] w-full object-cover"
                            />

                            {photo.caption && (
                              <p className="border-t border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                                {photo.caption}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {reportDisclaimers && reportDisclaimers.length > 0 && (
          <section className="avoid-break page-break rounded-2xl border border-purple-200 bg-purple-50 p-6">
            <h2 className="text-3xl font-black text-purple-800">
              Disclaimers
            </h2>

            <div className="mt-6 space-y-5">
              {reportDisclaimers.map((disclaimer: any) => (
                <div key={disclaimer.id} className="avoid-break rounded-xl border border-slate-300 bg-white p-5">
                  <h3 className="text-2xl font-black text-slate-950">
                    {disclaimer.topic}
                  </h3>

                  <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-700">
                    {disclaimer.disclaimer_text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="page-break">
          <h2 className="mb-8 text-4xl font-black text-slate-950">
            Inspection Findings
          </h2>

          <div className="space-y-10">
            {groupedFindingsArray.map((group) => {
              if (group.findings.length === 0 && !notesBySection[group.section]) return null;

              return (
                <section key={group.section} className="section-print-block space-y-5">
                  <h3 className="border-b-4 border-teal-600 pb-2 text-3xl font-black text-teal-800">
                    {group.section}
                  </h3>

                  {notesBySection[group.section] && (
                    <div className="avoid-break whitespace-pre-wrap rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm leading-6 text-slate-900">
                      {notesBySection[group.section]}
                    </div>
                  )}

                  {group.findings.map((finding: any) => (
                    <article
                      key={finding.id}
                      className="finding-card-print avoid-break overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm print:shadow-none"
                    >
                      <div className="border-b border-slate-300 bg-slate-100 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {getFindingItemNumber(finding) && (
                                <span className="rounded-full border border-orange-500 bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-800">
                                  Item #{getFindingItemNumber(finding)}
                                </span>
                              )}
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {finding.section}
                              </span>
                            </div>

                            <h4 className="mt-1 text-2xl font-black text-slate-950">
                              {finding.title || "Untitled Finding"}
                            </h4>

                            {finding.location && (
                              <p className="mt-1 text-sm font-bold text-slate-600">
                                📍 {finding.location}
                              </p>
                            )}
                          </div>

                          {finding.severity && (
                            <span
                              className={`rounded-full border px-4 py-2 text-sm font-black ${getSeverityClass(
                                finding.severity
                              )}`}
                            >
                              {finding.severity}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-6">
                        {(() => {
                          // finding.image_url is a legacy field that duplicates
                          // whichever photo is also saved as a row in the
                          // photos table - only fall back to it when there are
                          // no photos rows at all, otherwise it renders twice.
                          const hasPhotoRows = (finding.photos?.length || 0) > 0;
                          const showLegacyImage = Boolean(finding.image_url) && !hasPhotoRows;

                          if (!showLegacyImage && !hasPhotoRows) return null;

                          const photoCount =
                            (showLegacyImage ? 1 : 0) + (finding.photos?.length || 0);
                          const gridClass =
                            photoCount > 1 ? "md:grid-cols-2 print:grid-cols-2" : "";
                          const photoHeightClass =
                            photoCount > 1 ? "max-h-[360px]" : "max-h-[480px]";

                          return (
                            <div className={`mb-6 grid gap-4 ${gridClass}`}>
                              {showLegacyImage && (
                                <img
                                  src={finding.image_url}
                                  alt={finding.title || "Finding photo"} loading="lazy" decoding="async" fetchPriority="low"
                                className={`finding-photo-print w-full rounded-xl border object-contain ${photoHeightClass}`}
                                />
                              )}

                              {(finding.photos || []).map((photo: any) => (
                                <div key={photo.id}>
                                  {isVideoPhoto(photo) ? (
                                    <video
                                      src={photo.signed_url}
                                      poster={photo.thumbnail_url || undefined}
                                      controls
                                      muted
                                      playsInline
                                      preload="metadata"
                                      className={`finding-photo-print w-full rounded-xl border bg-black object-contain ${photoHeightClass}`}
                                    >
                                      Your browser does not support video playback.
                                    </video>
                                  ) : (
                                    <img
                                      src={photo.signed_url}
                                      alt={photo.caption || finding.title || "Finding photo"}
                                      className={`finding-photo-print w-full rounded-xl border object-contain ${photoHeightClass}`}
                                    />
                                  )}
                                  {photo.caption && (
                                    <p className="mt-1 text-sm leading-6 text-slate-800">
                                      {photo.caption}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <FindingTextBlock
                          title="Observation"
                          value={finding.observation}
                        />

                        <FindingTextBlock
                          title="Implication"
                          value={finding.implication}
                        />

                        <FindingTextBlock
                          title="Recommendation"
                          value={finding.recommendation}
                        />
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </section>

        <footer className="print-footer mt-12 border-t border-slate-300 pt-4 text-center text-xs text-slate-500">
          {[branding.name, branding.licenseInfo, branding.phone, branding.website || branding.email]
            .filter(Boolean)
            .join(" • ")}
        </footer>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold text-slate-950">
        {value || "Not Entered"}
      </p>
    </div>
  );
}

function DefectCountCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 text-center">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="flex justify-between gap-3 border-b border-slate-200 pb-1">
      <span className="font-black text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function FindingTextBlock({
  title,
  value,
}: {
  title: string;
  value: any;
}) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="mb-5">
      <h5 className="mb-2 text-lg font-black text-slate-950">{title}</h5>

      <p className="whitespace-pre-wrap text-base leading-7 text-slate-700">
        {value}
      </p>
    </div>
  );
}