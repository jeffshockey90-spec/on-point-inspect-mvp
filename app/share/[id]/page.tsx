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
    photo?.url ||
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

function getMediaUrl(media: any) {
  if (!media) return "";

  return (
    media?.signed_url ||
    media?.public_url ||
    media?.image_url ||
    media?.photo_url ||
    media?.url ||
    ""
  );
}

function getMediaPreviewUrl(media: any) {
  if (!media) return "";

  return (
    media?.signed_thumbnail_url ||
    media?.thumbnail_url ||
    getMediaUrl(media)
  );
}

function getFindingPrimaryMedia(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];

  const imagePhoto = photos.find((photo: any) => {
    const url = getMediaUrl(photo);
    return url && !isVideoMedia(photo, url);
  });

  if (imagePhoto) return imagePhoto;

  const firstUsablePhoto = photos.find((photo: any) => getMediaUrl(photo));
  if (firstUsablePhoto) return firstUsablePhoto;

  const legacyUrl =
    finding?.signed_image_url ||
    finding?.image_url ||
    finding?.public_image_url ||
    "";

  if (!legacyUrl) return null;

  return {
    signed_url: legacyUrl,
    public_url: legacyUrl,
    image_url: legacyUrl,
    photo_url: legacyUrl,
    file_path:
      finding?.file_path ||
      finding?.storage_path ||
      finding?.photo_path ||
      finding?.image_path ||
      "",
    mime_type:
      finding?.mime_type ||
      finding?.media_type ||
      finding?.content_type ||
      finding?.file_type ||
      "",
    is_video: finding?.is_video || finding?.media_type === "video",
  };
}

function getFindingPhotoUrl(finding: any) {
  const primaryMedia = getFindingPrimaryMedia(finding);
  return getMediaUrl(primaryMedia);
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








function getEquipmentLongNote(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    const clean = String(value || "").trim();

    if (isKnownEquipmentValue(clean)) {
      return clean;
    }
  }

  return "";
}

function ShareEquipmentLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-slate-800 py-2 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="whitespace-pre-line text-left text-sm font-semibold leading-6 text-slate-100 sm:max-w-[70%] sm:text-right">
        {String(value)}
      </span>
    </div>
  );
}

function ShareEquipmentNoteBlock({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  const clean = String(value || "").trim();

  if (!isKnownEquipmentValue(clean)) return null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
        {clean}
      </p>
    </div>
  );
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




function getEquipmentStatusValue(item: any) {
  const explicit =
    item?.equipment_status ||
    item?.equipmentStatus ||
    item?.status ||
    "";

  if (isKnownEquipmentValue(explicit)) return explicit;

  const condition = String(item?.condition || "").toLowerCase();
  const severity = String(item?.severity || "").toLowerCase();
  const ageText = String(item?.estimated_age || item?.estimatedAge || "");
  const rangeText = String(item?.expected_service_life || item?.expectedServiceLife || "");

  const ageNumber = Number(ageText.replace(/[^0-9.]/g, ""));
  const rangeNumbers = rangeText.match(/\d+/g) || [];
  const maxLife = rangeNumbers.length > 0 ? Number(rangeNumbers[rangeNumbers.length - 1]) : null;

  if (severity.includes("safety") || condition.includes("failed") || condition.includes("not operating")) {
    return "⚠ Service Recommended";
  }

  if (maxLife && Number.isFinite(ageNumber) && ageNumber >= maxLife - 2) {
    return "⚠ Near End of Typical Service Life";
  }

  if (condition.includes("service") || condition.includes("repair")) {
    return "⚠ Service Recommended";
  }

  return "✓ Operating Normally";
}

function getEquipmentStatusClass(value: any) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("operating normally") || clean.includes("no specific")) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }

  if (clean.includes("safety") || clean.includes("service recommended")) {
    return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  }

  if (clean.includes("near end") || clean.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
}

function formatEquipmentCapacity(item: any) {
  const raw = String(
    item?.capacity ||
      item?.estimated_btu ||
      item?.estimatedBTU ||
      ""
  ).trim();

  if (!isKnownEquipmentValue(raw)) return "";

  return raw;
}

function getEquipmentSeer(item: any) {
  return (
    item?.estimated_seer ||
    item?.estimatedSEER ||
    item?.seer ||
    ""
  );
}

function getEquipmentAfue(item: any) {
  return (
    item?.estimated_afue ||
    item?.estimatedAFUE ||
    item?.afue ||
    ""
  );
}

function getEquipmentHeatingEfficiency(item: any) {
  return (
    item?.estimated_heating_efficiency ||
    item?.estimatedHeatingEfficiency ||
    item?.hspf ||
    item?.hspf2 ||
    ""
  );
}

function EquipmentStatusBadge({ value }: { value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-black ${getEquipmentStatusClass(value)}`}>
      <span className="mr-2 text-xs uppercase tracking-wide opacity-80">
        Equipment Status
      </span>
      {String(value)}
    </div>
  );
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

  const isDemo =
    resolvedSearchParams?.role === "demo";

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

  if (!isDemo) {
    await recordInspectionView({
      inspectionId,
      viewType: "report_share",
      contactId: resolvedSearchParams?.contact || null,
      viewerRole: resolvedSearchParams?.role || null,
      viewerEmail: resolvedSearchParams?.email || null,
    });
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
  if (!isKnownEquipmentValue(value)) return null;

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
  if (!isKnownEquipmentValue(value)) return null;

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
