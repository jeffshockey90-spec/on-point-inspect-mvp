
import { formatAppValue } from "../../../lib/app-time";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import PrintButton from "../../../components/PrintButton";
import CollapsibleReportSection from "../../../components/CollapsibleReportSection";
import ReportFindingsSortable from "./ReportFindingsSortable";
import OfflineReportCacheBridge from "../../../components/OfflineReportCacheBridge";
import SendReportEmailButtons from "../../../components/SendReportEmailButtons";
import InspectionContactsManager from "../../../components/InspectionContactsManager";
import AgreementSelector from "../../../components/AgreementSelector";
import AgreementStatusPanel from "../../../components/AgreementStatusPanel";
import ReportDeliveryGuard from "../../../components/ReportDeliveryGuard";
import SendAgreementButton from "../../../components/SendAgreementButton";
import SendFullReportButton from "../../../components/SendFullReportButton";
import InsertFavoriteFindingButton from "../../../components/InsertFavoriteFindingButton";
import OneTapAIFindingInsert from "../../../components/OneTapAIFindingInsert";
import PaymentInvoicePanel from "../../../components/PaymentInvoicePanel";
import GenerateSummaryButton from "../../../components/GenerateSummaryButton";
import SendReviewRequestButton from "../../../components/SendReviewRequestButton";
import DeleteSummaryButton from "../../../components/DeleteSummaryButton";
import FastLinkButton from "../../../components/FastLinkButton";
import CreateDemoReportButton from "../../../components/CreateDemoReportButton";
import SampleReportManager from "../../../components/SampleReportManager";
import AIReportReviewPanel from "../../../components/AIReportReviewPanel";
import LiveHouseIntelligencePanel from "../../../components/LiveHouseIntelligencePanel";
import InspectionCopilotPanel from "../../../components/InspectionCopilotPanel";
import HouseRelationshipPanel from "../../../components/HouseRelationshipPanel";
import LiveInspectionTimelinePanel from "../../../components/LiveInspectionTimelinePanel";
import AIPublishGuardPanel from "../../../components/AIPublishGuardPanel";
import ReportDisclaimers from "../../../components/ReportDisclaimers";
import PropertyPhotoUploader from "../../../components/PropertyPhotoUploader";
import OpenCommandCenterToolButton from "../../../components/OpenCommandCenterToolButton";
import PublishReportActionButton from "../../../components/PublishReportActionButton";
import InspectorToolsDrawer, {
  type WorkspaceNotification,
} from "../../../components/InspectorToolsDrawer";
import { aiPublishGuard } from "../../../lib/ai/AIPublishGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  "Garage",
];


function createSupabaseStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createServiceClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    },
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

function addRepairItemNumbers(findings: any[]) {
  const sectionGroupMap = new Map<string, number>();
  const sectionGroupCounts = new Map<string, number>();

  return (findings || []).map((finding: any) => {
    const section = normalizeSection(finding?.section);
    const sectionNumberRaw = SECTION_ORDER.indexOf(section) + 1;
    const sectionNumber = sectionNumberRaw > 0 ? sectionNumberRaw : SECTION_ORDER.length + 1;
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
      item_number: repairItemNumber,
      repair_item_number: repairItemNumber,
    };
  });
}

function getNumberedFindingTitle(finding: any) {
  const itemNumber = String(finding?.repair_item_number || finding?.item_number || "").trim();
  const title = getRepairNumberTitle(finding);

  return itemNumber ? `${itemNumber} - ${title}` : title;
}


function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const cleanUrl = String(url || "").split("?")[0];
  const markers = [
    "/inspection-photos/",
    "/object/public/inspection-photos/",
    "/object/sign/inspection-photos/",
    "/object/authenticated/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = cleanUrl.indexOf(marker);

    if (index !== -1) {
      return decodeURIComponent(cleanUrl.substring(index + marker.length));
    }
  }

  if (cleanUrl.startsWith("property-photos/") || cleanUrl.startsWith("properties/")) {
    return decodeURIComponent(cleanUrl);
  }

  return "";
}

function getSingleSearchParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function getPropertyPhotoErrorMessage(code: string) {
  switch (code) {
    case "missing":
      return "Choose a property photo before clicking Change Photo.";
    case "type":
      return "That file type is not supported. Use a JPG, PNG, or WebP image.";
    case "size":
      return "That image is too large. Use a photo that is 20MB or smaller.";
    case "heic":
      return "iPhone HEIC photos are not supported here yet. Please choose Most Compatible/JPG or send a screenshot/JPG version.";
    case "upload":
      return "The photo could not be uploaded. Try a smaller JPG photo.";
    case "url":
      return "The photo uploaded, but the app could not create the photo URL.";
    case "save":
      return "The photo uploaded, but the report could not be updated.";
    default:
      return "Property photo update failed. Try a smaller JPG photo.";
  }
}

function getSafePropertyPhotoExtension(file: File) {
  const type = String(file.type || "").toLowerCase();
  const nameExtension =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";

  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";

  if (["jpg", "jpeg"].includes(nameExtension)) return "jpg";
  if (["png", "webp"].includes(nameExtension)) return nameExtension;

  return "jpg";
}

function getSafePropertyPhotoContentType(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

const REPORT_IMAGE_TRANSFORM_OPTIONS = {
  transform: {
    width: 640,
    quality: 72,
    resize: "contain",
  },
};

async function createSignedPhotoUrl(supabase: any, photo: any) {
  const existing =
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    null;

  const filePath =
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url);

  if (!filePath) return existing;

  const { data, error } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(filePath, 60 * 60 * 24 * 7, REPORT_IMAGE_TRANSFORM_OPTIONS);

  if (error || !data?.signedUrl) return existing;

  return data.signedUrl;
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
      .createSignedUrls(chunk, 60 * 60 * 24 * 7, REPORT_IMAGE_TRANSFORM_OPTIONS);

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

async function createSignedRawUrlMap(supabase: any, paths: string[]) {
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
      console.error("Batch signed raw photo URL error:", error);
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

function getPhotoFallbackUrl(photo: any) {
  return (
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    ""
  );
}

function isVideoPhotoFile(photo: any, pathValue: any = "") {
  const path = String(
    pathValue ||
      photo?.file_path ||
      photo?.storage_path ||
      photo?.photo_path ||
      photo?.image_path ||
      photo?.video_path ||
      ""
  ).toLowerCase();

  const type = String(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type ||
      ""
  ).toLowerCase();

  const url = String(
    photo?.signed_url ||
      photo?.public_url ||
      photo?.image_url ||
      photo?.photo_url ||
      photo?.video_url ||
      ""
  ).toLowerCase();

  return (
    Boolean(photo?.is_video) ||
    Boolean(photo?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/.test(path) ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/.test(url)
  );
}

function formatEmailStatusDate(value: any) {
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

function parseRepairMoneyValue(value: any) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatRepairMoney(value: any) {
  const number = parseRepairMoneyValue(value);

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getRepairRequestRequestedCredit(share: any) {
  return parseRepairMoneyValue(
    share?.requested_credit_total ??
      share?.metadata?.requested_credit_total ??
      0
  );
}

function getRepairRequestSignatures(share: any) {
  const metadata =
    share?.metadata && typeof share.metadata === "object" && !Array.isArray(share.metadata)
      ? share.metadata
      : {};

  const signatures =
    metadata?.repair_request_signatures &&
    typeof metadata.repair_request_signatures === "object" &&
    !Array.isArray(metadata.repair_request_signatures)
      ? metadata.repair_request_signatures
      : {};

  return signatures;
}

function hasRepairRequestSignature(share: any, party: "buyer" | "seller") {
  const signatures = getRepairRequestSignatures(share);
  const signature = signatures?.[party] || {};

  return Boolean(
    String(signature?.printed_name || signature?.printedName || "").trim() &&
      (String(signature?.signature || "").trim() ||
        String(signature?.signature_image || signature?.signatureImage || "").trim())
  );
}

function getRepairRequestStatus(share: any, responseCount = 0) {
  const status = String(share?.status || "").toLowerCase();
  const buyerSigned = hasRepairRequestSignature(share, "buyer");
  const sellerSigned = hasRepairRequestSignature(share, "seller");

  if (buyerSigned && sellerSigned) return "Fully Executed";
  if (sellerSigned) return "Seller Signed";
  if (share?.responded_at || responseCount > 0 || status === "responded") return "Responded";
  if (status === "failed") return "Failed";
  if (status === "viewed") return "Viewed";
  return "Sent";
}

function getRepairRequestStatusClass(status: string) {
  const clean = String(status || "").toLowerCase();

  if (clean.includes("fully")) return "border-emerald-400/60 bg-emerald-500/15 text-emerald-200";
  if (clean.includes("seller") || clean.includes("responded")) return "border-teal-400/60 bg-teal-500/15 text-teal-200";
  if (clean.includes("viewed")) return "border-blue-400/60 bg-blue-500/15 text-blue-200";
  if (clean.includes("failed")) return "border-red-400/60 bg-red-500/15 text-red-200";
  return "border-yellow-400/60 bg-yellow-500/15 text-yellow-100";
}

function getRepairRequestSelectedCount(share: any) {
  return Array.isArray(share?.selected_finding_ids) ? share.selected_finding_ids.length : 0;
}

function getRepairRequestLabel(index: number, total: number) {
  return `Repair Request #${Math.max(1, total - index)}`;
}

function getRepairRequestCreatorLabel(share: any) {
  const metadata =
    share?.metadata && typeof share.metadata === "object" && !Array.isArray(share.metadata)
      ? share.metadata
      : {};

  const role = String(
    share?.created_by_role ||
      metadata?.created_by_role ||
      "inspector"
  ).trim();

  const name = String(
    share?.created_by_name ||
      metadata?.created_by_name ||
      share?.created_by_email ||
      metadata?.created_by_email ||
      ""
  ).trim();

  const label = role.toLowerCase().includes("realtor") ? "Realtor" : "Inspector";

  return name ? `${label}: ${name}` : label;
}

function getSampleReportTitle(inspection: any) {
  return (
    inspection?.address ||
    inspection?.property_address ||
    inspection?.client_name ||
    "Sample Inspection Report"
  );
}

function getSampleReportDescription(inspection: any) {
  const service = String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      "Home Inspection"
  ).trim();

  return `${service || "Home Inspection"} sample report from FLOW.`;
}

function getSampleReportCoverUrl(inspection: any) {
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

function getLatestEmailLog(logs: any[], type: string) {
  return (logs || []).find((log: any) => {
    const emailType = String(
      log.email_type || log.metadata?.type || "",
    ).toLowerCase();
    return emailType === type;
  });
}

function getLatestViewLog(logs: any[], type: string) {
  return (logs || []).find((log: any) => {
    const viewType = String(log.view_type || "").toLowerCase();
    return viewType === type;
  });
}

function getViewLogsByType(logs: any[], type: string) {
  const cleanType = String(type || "").toLowerCase();

  return (logs || []).filter((log: any) => {
    const viewType = String(log.view_type || "").toLowerCase();
    return viewType === cleanType;
  });
}

function getFirstViewLog(logs: any[]) {
  if (!logs || logs.length === 0) return null;

  return [...logs].sort(
    (a: any, b: any) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime(),
  )[0];
}

function getUniqueViewerCount(logs: any[]) {
  const viewers = new Set<string>();

  (logs || []).forEach((log: any) => {
    const viewerEmail = String(log.viewer_email || "")
      .trim()
      .toLowerCase();
    const contactId = String(log.contact_id || "").trim();
    const viewerRole = String(log.viewer_role || "")
      .trim()
      .toLowerCase();
    const ipAddress = String(log.ip_address || "").trim();

    const key = viewerEmail || contactId || `${viewerRole}:${ipAddress}`;
    if (key && key !== ":") viewers.add(key);
  });

  return viewers.size;
}

function getDurationSeconds(log: any) {
  const seconds = Number(log?.metadata?.duration_seconds || 0);
  return Number.isFinite(seconds) ? seconds : 0;
}

function formatDuration(secondsValue: number) {
  const seconds = Math.max(0, Math.round(secondsValue || 0));

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getViewerLabel(log: any) {
  const viewerEmail = String(log?.viewer_email || "").trim();
  const viewerRole = String(log?.viewer_role || "").trim();
  const contactId = String(log?.contact_id || "").trim();

  return viewerEmail || viewerRole || (contactId ? `Contact ${contactId}` : "Unknown viewer");
}

function getViewerKey(log: any) {
  const viewerEmail = String(log?.viewer_email || "")
    .trim()
    .toLowerCase();
  const contactId = String(log?.contact_id || "").trim();
  const viewerRole = String(log?.viewer_role || "")
    .trim()
    .toLowerCase();
  const ipAddress = String(log?.ip_address || "").trim();

  return viewerEmail || contactId || `${viewerRole}:${ipAddress}` || "unknown";
}

function getViewerActivitySummary(logs: any[]) {
  const map = new Map<string, any>();

  (logs || []).forEach((log: any) => {
    const key = getViewerKey(log);
    if (!key || key === ":") return;

    const label = getViewerLabel(log);
    const role = String(log?.viewer_role || "").trim();
    const email = String(log?.viewer_email || "").trim();
    const viewType = String(log?.view_type || "activity").trim();
    const createdAt = log?.created_at || "";
    const duration = getDurationSeconds(log);

    const existing = map.get(key) || {
      key,
      label,
      email,
      role,
      count: 0,
      totalSeconds: 0,
      latestAt: "",
      types: new Map<string, number>(),
    };

    existing.count += 1;
    existing.totalSeconds += duration;

    if (email && !existing.email) existing.email = email;
    if (role && !existing.role) existing.role = role;
    if (label && existing.label === "Unknown viewer") existing.label = label;

    existing.types.set(viewType, (existing.types.get(viewType) || 0) + 1);

    if (
      createdAt &&
      (!existing.latestAt ||
        new Date(createdAt).getTime() > new Date(existing.latestAt).getTime())
    ) {
      existing.latestAt = createdAt;
    }

    map.set(key, existing);
  });

  return Array.from(map.values()).sort(
    (a: any, b: any) =>
      new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime(),
  );
}

function getViewerActivityItems(logs: any[]) {
  return getViewerActivitySummary(logs).slice(0, 8);
}

function formatViewType(value: any) {
  const clean = String(value || "")
    .replaceAll("_", " ")
    .trim();

  if (!clean) return "Activity";

  return clean.replace(/\w/g, (letter) => letter.toUpperCase());
}

function normalizeEmail(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isClientViewLog(log: any, clientEmail: string) {
  const role = String(log?.viewer_role || "")
    .trim()
    .toLowerCase();
  const email = normalizeEmail(log?.viewer_email);

  return (
    role.includes("client") ||
    role.includes("buyer") ||
    Boolean(clientEmail && email && email === clientEmail)
  );
}

function isRealtorViewLog(log: any, realtorEmails: string[]) {
  const role = String(log?.viewer_role || "")
    .trim()
    .toLowerCase();
  const email = normalizeEmail(log?.viewer_email);

  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("transaction") ||
    Boolean(email && realtorEmails.includes(email))
  );
}

function getFinalReadingSeconds(logs: any[]) {
  return (logs || []).reduce((sum: number, log: any) => {
    const viewType = String(log?.view_type || "").toLowerCase();
    if (viewType !== "report_time_final") return sum;
    return sum + getDurationSeconds(log);
  }, 0);
}

function getLatestViewLogFromList(logs: any[]) {
  if (!logs || logs.length === 0) return null;

  return [...logs].sort(
    (a: any, b: any) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime(),
  )[0];
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



async function loadEmailLogs(supabase: any, inspectionId: any) {
  const numericInspectionId = Number(inspectionId);

  if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
    return { data: [], error: null };
  }

  const byBigint = await supabase
    .from("email_logs")
    .select("*")
    .eq("inspection_id_bigint", numericInspectionId)
    .order("created_at", { ascending: false });

  if (!byBigint.error) return byBigint;

  const byInspectionId = await supabase
    .from("email_logs")
    .select("*")
    .eq("inspection_id", numericInspectionId)
    .order("created_at", { ascending: false });

  if (!byInspectionId.error) return byInspectionId;

  console.error("Email logs load failed for both inspection ID columns:", {
    inspectionId: numericInspectionId,
    bigintError: byBigint.error,
    inspectionIdError: byInspectionId.error,
  });

  return { data: [], error: null };
}

function AttentionPanel({
  title,
  eyebrow = "AI Review",
  badge,
  helper,
  defaultOpen = false,
  children,
}: any) {
  return (
    <details
      open={defaultOpen}
      className="mb-8 overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-4 hover:bg-slate-800/40">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-teal-300">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-black text-white">{title}</h2>
          {helper ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {badge ? (
            <span className="rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1 text-xs font-black text-yellow-200">
              {badge}
            </span>
          ) : null}
          <span className="rounded-full border border-slate-600 bg-black/30 px-3 py-1 text-xs font-black text-slate-300">
            Tap to open
          </span>
        </div>
      </summary>

      <div className="p-4">{children}</div>
    </details>
  );
}

function parseYearBuiltValue(value: any) {
  const match = String(value || "").match(/(18|19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  if (!Number.isFinite(year) || year < 1800 || year > new Date().getFullYear() + 1) return null;
  return year;
}

function getInspectionYearBuilt(inspection: any) {
  return parseYearBuiltValue(
    inspection?.year_built ||
      inspection?.built_year ||
      inspection?.construction_year ||
      inspection?.property_year_built
  );
}

function getAgeBasedWatchlistItems(year: number | null) {
  if (!year) return [];

  const items: any[] = [];
  const age = new Date().getFullYear() - year;

  if (age >= 25) {
    items.push({
      title: "Older home / concealed conditions",
      reason: `Home is approximately ${age} years old. Older materials, renovations, and concealed conditions may be present.`,
      tips: ["Look for old repairs", "Check visible transitions between old/new work", "Document inaccessible areas"],
    });
  }

  if (year <= 1977) {
    items.push({
      title: "Lead-based paint potential",
      reason: "Homes built before 1978 may contain lead-based paint.",
      tips: ["Look for peeling paint", "Watch painted trim/windows", "Do not state testing was performed unless sampled"],
    });
  }

  if (year <= 1989) {
    items.push({
      title: "Asbestos-containing material potential",
      reason: "Older homes may contain asbestos in insulation, flooring, siding, ceilings, duct materials, or roofing products.",
      tips: ["Look for 9x9 tile", "Watch pipe/duct wrap", "Document suspect materials without confirming asbestos"],
    });
  }

  if (year <= 1965) {
    items.push({
      title: "Older electrical / grounding",
      reason: "Homes from this era commonly have older wiring methods and may lack modern grounding or safety protection.",
      tips: ["Check receptacle grounding", "Look for cloth wiring", "Check panel age and labeling"],
    });
  }

  if (year >= 1965 && year <= 1978) {
    items.push({
      title: "Aluminum branch wiring possibility",
      reason: "Homes and additions from the mid-1960s through 1970s may contain aluminum branch wiring.",
      tips: ["Look carefully in the panel", "Document if suspected", "Recommend electrician if present"],
    });
  }

  if (year <= 1975) {
    items.push({
      title: "Older plumbing materials",
      reason: "Galvanized supply piping, cast iron drains, or older plumbing materials may be present.",
      tips: ["Check visible supply piping", "Look for corrosion/leaks", "Check drain piping and slow drainage"],
    });
  }

  if (year <= 2000) {
    items.push({
      title: "Modern safety standards may differ",
      reason: "Older homes may not include modern GFCI/AFCI, smoke/CO, stair, guardrail, and deck safety standards.",
      tips: ["Check GFCI areas", "Look at rail/guard spacing", "Document safety upgrades as recommendations"],
    });
  }

  return items;
}

function getFindingBasedWatchlistItems(findings: any[]) {
  const text = (findings || [])
    .map((finding: any) =>
      [
        finding?.title,
        finding?.observation,
        finding?.implication,
        finding?.recommendation,
        finding?.comment,
        finding?.section,
        finding?.severity,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ")
    .toLowerCase();

  const rules = [
    {
      title: "Fuel oil / environmental concern",
      keywords: ["oil tank", "fuel oil", "buried tank", "abandoned tank", "oil line"],
      reason: "Report notes mention oil/fuel storage concerns.",
      tips: ["Look for staining", "Check visible tank/lines", "Recommend environmental/tank specialist as needed"],
    },
    {
      title: "Moisture / microbial growth concern",
      keywords: ["mold", "microbial", "musty", "staining", "moisture", "water intrusion"],
      reason: "Report notes mention moisture or possible microbial concerns.",
      tips: ["Document moisture source", "Photograph staining", "Recommend specialist/testing if needed"],
    },
    {
      title: "Limited access / concealed areas",
      keywords: ["inaccessible", "not accessible", "limited access", "stored items", "blocked", "concealed"],
      reason: "Report notes mention areas that were not fully visible or accessible.",
      tips: ["Document exact limitation", "Add limitation photos", "Add concealed/inaccessible disclaimer"],
    },
    {
      title: "Weather limitation",
      keywords: ["snow", "ice", "rain", "weather", "wet roof", "roof covered"],
      reason: "Report notes mention weather conditions that may limit visibility or access.",
      tips: ["Document areas not visible", "Use limitation comments", "Recommend reinspection if needed"],
    },
  ];

  return rules.filter((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
}

function getSuggestedDisclaimerTopicsForReport(year: number | null, findings: any[]) {
  const topics = new Set<string>();

  if (year) {
    if (year <= 1999) topics.add("Older Home Disclaimer");
    if (year <= 1977) topics.add("Lead-Based Paint");
    if (year <= 1989) topics.add("Asbestos");
    if (year <= 1989) topics.add("Environmental / Hazardous Materials");
    if (year <= 2005) topics.add("Code Compliance");
    if (year <= 1999) topics.add("Permit / Previous Work Unknown");
    if (year <= 1975) topics.add("Older Plumbing Materials");
    if (year <= 1978) topics.add("Older Electrical System");
  }

  const text = (findings || [])
    .map((finding: any) => [finding?.title, finding?.observation, finding?.implication, finding?.recommendation, finding?.comment].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

  if (/oil tank|fuel oil|buried tank|abandoned tank/.test(text)) topics.add("Oil Tank / Fuel Storage");
  if (/mold|microbial|musty|moisture|water intrusion/.test(text)) topics.add("Mold / Microbial Growth");
  if (/snow|ice|rain|weather|wet roof|roof covered/.test(text)) topics.add("Snow / Weather Limitations");
  if (/inaccessible|limited access|stored items|blocked|concealed/.test(text)) topics.add("Concealed / Inaccessible Areas");
  if (/utilities off|gas off|water off|electric off|not operated|shut off/.test(text)) topics.add("Utilities Off / Not Operated");

  return Array.from(topics);
}

export default async function ReportPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const propertyPhotoUpdated = getSingleSearchParam(resolvedSearchParams, "property_photo_updated") === "1";
  const propertyPhotoError = getSingleSearchParam(resolvedSearchParams, "property_photo_error");
  const supabase = await createSupabaseServerClient();

  async function updateInspectionDetails(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "").trim();
    const clientName = String(formData.get("client_name") || "").trim();
    const clientEmail = String(formData.get("client_email") || "")
      .trim()
      .toLowerCase();

    if (!inspectionId) redirect("/reports");

    const { data: updatedInspection, error: inspectionUpdateError } =
      await supabase
        .from("inspections")
        .update({
          address: String(formData.get("address") || "").trim(),
          property_address: String(formData.get("address") || "").trim(),
          client_name: clientName,
          client_email: clientEmail,
          realtor_name: String(formData.get("realtor_name") || "").trim(),
          inspection_date: String(formData.get("inspection_date") || "").trim(),
          square_feet: String(formData.get("square_feet") || "").trim(),
          year_built: String(formData.get("year_built") || "").trim(),
          city: String(formData.get("city") || "").trim(),
          state: String(formData.get("state") || "").trim(),
          zip: String(formData.get("zip") || "").trim(),
        })
        .eq("id", inspectionId)
        .eq("inspector_id", user.id)
        .select("id")
        .single();

    if (inspectionUpdateError || !updatedInspection) {
      console.error(
        "Update inspection details error:",
        inspectionUpdateError,
      );
      redirect(`/reports/${inspectionId}?details_update_error=1`);
    }

    // Keep the primary client contact synchronized so the report, client
    // portal, agreements, and email recipient labels do not continue showing
    // the original placeholder name.
    const { data: primaryClientContact } = await supabase
      .from("inspection_contacts")
      .select("id")
      .eq("inspection_id", inspectionId)
      .eq("role", "client")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (primaryClientContact?.id) {
      const { error: contactUpdateError } = await supabase
        .from("inspection_contacts")
        .update({
          name: clientName,
          email: clientEmail || null,
        })
        .eq("id", primaryClientContact.id)
        .eq("inspection_id", inspectionId);

      if (contactUpdateError) {
        console.error(
          "Primary client contact sync error:",
          contactUpdateError,
        );
      }
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/reports/${inspectionId}/print`);
    revalidatePath(`/share/${inspectionId}`);
    revalidatePath(`/client-portal/${inspectionId}`);
    revalidatePath("/reports");
    redirect(`/reports/${inspectionId}?details_updated=1`);
  }

  async function updatePropertyPhoto(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");
    const file = formData.get("property_photo") as File | null;

    if (!inspectionId || !file || file.size === 0) {
      redirect(`/reports/${inspectionId || id}?property_photo_error=missing`);
    }

    if (!String(file.type || "").startsWith("image/")) {
      redirect(`/reports/${inspectionId}?property_photo_error=type`);
    }

    const { data: ownedInspection } = await supabase
      .from("inspections")
      .select("id")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (!ownedInspection) redirect("/reports");

    const maxBytes = 20 * 1024 * 1024;

    if (file.size > maxBytes) {
      redirect(`/reports/${inspectionId}?property_photo_error=size`);
    }

    const rawType = String(file.type || "").toLowerCase();
    const rawName = String(file.name || "").toLowerCase();
    const isHeicOrHeif =
      rawType.includes("heic") ||
      rawType.includes("heif") ||
      rawName.endsWith(".heic") ||
      rawName.endsWith(".heif");

    if (isHeicOrHeif) {
      redirect(`/reports/${inspectionId}?property_photo_error=heic`);
    }

    const storageSupabase = createSupabaseStorageClient() || supabase;
    const extension = getSafePropertyPhotoExtension(file);
    const contentType = getSafePropertyPhotoContentType(extension);
    const filePath = `property-photos/${inspectionId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await storageSupabase.storage
      .from("inspection-photos")
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Property photo upload error:", uploadError);
      redirect(`/reports/${inspectionId}?property_photo_error=upload`);
    }

    const { data: publicUrlData } = storageSupabase.storage
      .from("inspection-photos")
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || "";

    if (!publicUrl) {
      redirect(`/reports/${inspectionId}?property_photo_error=url`);
    }

    const { error: updateError } = await supabase
      .from("inspections")
      .update({
        property_image: publicUrl,
        street_view_url: publicUrl,
        cover_photo_url: publicUrl,
      })
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    if (updateError) {
      console.error("Property photo save error:", updateError);
      redirect(`/reports/${inspectionId}?property_photo_error=save`);
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/reports/${inspectionId}/print`);
    revalidatePath(`/share/${inspectionId}`);
    revalidatePath(`/client-portal/${inspectionId}`);
    redirect(`/reports/${inspectionId}?property_photo_updated=1`);
  }


  async function deleteEquipmentInventoryItem(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");
    const equipmentId = String(formData.get("equipment_id") || "");

    if (!inspectionId || !equipmentId) {
      redirect(`/reports/${inspectionId || id}`);
    }

    const { data: ownedInspection } = await supabase
      .from("inspections")
      .select("id")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (!ownedInspection) {
      redirect("/reports");
    }

    const { error } = await supabase
      .from("equipment_inventory")
      .delete()
      .eq("id", equipmentId)
      .eq("inspection_id", Number(inspectionId));

    if (error) {
      console.error("Delete equipment inventory error:", error);
      redirect(`/reports/${inspectionId}?equipment_delete_error=1`);
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/reports/${inspectionId}/print`);
    revalidatePath(`/share/${inspectionId}`);
    redirect(`/reports/${inspectionId}#equipment-inventory`);
  }

  async function updateEquipmentInventoryItem(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");
    const equipmentId = String(formData.get("equipment_id") || "");

    const condition = String(formData.get("condition") || "").trim();
    const inspectorNote = String(formData.get("inspector_note") || "").trim();
    const maintenanceNote = String(formData.get("maintenance_note") || "").trim();
    const equipmentStatus = String(formData.get("equipment_status") || "").trim();

    const { data: ownedInspection } = await supabase
      .from("inspections")
      .select("id")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (!ownedInspection) {
      redirect("/reports");
    }

    const { error } = await supabase
      .from("equipment_inventory")
      .update({
        condition,
        inspector_note: inspectorNote,
        maintenance_note: maintenanceNote,
        equipment_status: equipmentStatus || undefined,
      })
      .eq("id", equipmentId)
      .eq("inspection_id", inspectionId);

    if (error) {
      console.error("Update equipment inventory error:", error);
      redirect(`/reports/${inspectionId}?equipment_update_error=1`);
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/reports/${inspectionId}/print`);
    revalidatePath(`/share/${inspectionId}`);
    redirect(`/reports/${inspectionId}#equipment-inventory`);
  }


  async function publishReport(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");

    const [guardInspectionResult, guardFindingsResult, guardEquipmentResult] =
      await Promise.all([
        supabase
          .from("inspections")
          .select("*")
          .eq("id", inspectionId)
          .eq("inspector_id", user.id)
          .single(),
        supabase
          .from("findings")
          .select("*")
          .eq("inspection_id", inspectionId)
          .order("created_at", { ascending: true }),
        supabase
          .from("equipment_inventory")
          .select("*")
          .eq("inspection_id", inspectionId)
          .order("created_at", { ascending: true }),
      ]);

    if (guardInspectionResult.error || !guardInspectionResult.data) {
      console.error("Publish guard inspection load error:", guardInspectionResult.error);
      redirect(`/reports/${inspectionId}?publish_guard_error=1`);
    }

    const guardFindings = guardFindingsResult.data || [];
    const guardFindingIds = guardFindings.map((finding: any) => finding.id).filter(Boolean);

    const { data: guardPhotos, error: guardPhotosError } =
      guardFindingIds.length > 0
        ? await supabase.from("photos").select("*").in("finding_id", guardFindingIds)
        : { data: [], error: null };

    if (guardPhotosError) {
      console.error("Publish guard photos load error:", guardPhotosError);
    }

    const guardPhotosByFindingId = (guardPhotos || []).reduce(
      (acc: Record<string, any[]>, photo: any) => {
        const findingId = String(photo.finding_id || "");
        if (!findingId) return acc;
        if (!acc[findingId]) acc[findingId] = [];
        acc[findingId].push(photo);
        return acc;
      },
      {},
    );

    const guardNormalizedFindings = guardFindings.map((finding: any) => ({
      ...finding,
      section: normalizeSection(finding.section || finding.section_name),
      photos: guardPhotosByFindingId[String(finding.id)] || [],
    }));

    const guardResult = aiPublishGuard.analyze({
      inspection: guardInspectionResult.data,
      findings: guardNormalizedFindings,
      equipment: guardEquipmentResult.data || [],
      photos: guardPhotos || [],
    });

    if (guardResult.blocked) {
      console.warn("AI Publish Guard blocked publish:", guardResult);
      redirect(`/reports/${inspectionId}?publish_guard=blocked`);
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("inspections")
      .update({
        report_status: "Published",
        published: true,
        published_at: now,
      })
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    if (error) {
      console.error("Publish report error:", error);
      redirect(`/reports/${inspectionId}?publish_error=1`);
    }

    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");
      const cookieStore = await cookies();
      const cookieHeader = cookieStore
        .getAll()
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      const reportEmailRes = await fetch(`${appUrl}/api/send-report-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: "all",
        }),
        cache: "no-store",
      });

      if (!reportEmailRes.ok) {
        const reportEmailData = await reportEmailRes.json().catch(() => ({}));
        console.error("Publish report email send error:", reportEmailData);
      }
    } catch (sendError) {
      console.error("Publish report email send failed:", sendError);
    }

    const { data: publishInspection } = await supabase
      .from("inspections")
      .select("service_mode, inspection_type, services")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    const serviceType = String(
      publishInspection?.service_mode ||
        publishInspection?.inspection_type ||
        publishInspection?.services ||
        "",
    ).toLowerCase();

    const isStandaloneEnvironmentalReport =
      serviceType.includes("radon_only") ||
      serviceType.includes("mold_only") ||
      serviceType.includes("radon_mold");

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath(`/share/${inspectionId}`);
    revalidatePath(`/client-portal/${inspectionId}`);
    revalidatePath(`/environmental-share/${inspectionId}`);
    revalidatePath(`/environmental-report/${inspectionId}`);

    if (isStandaloneEnvironmentalReport) {
      redirect(`/environmental-share/${inspectionId}`);
    }

    redirect(`/share/${inspectionId}`);
  }

  async function addSampleReportToPublicProfile(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");
    const shareUrl = String(formData.get("share_url") || "").trim();

    if (!inspectionId || !shareUrl) {
      redirect(`/reports/${inspectionId || id}?sample_error=missing`);
    }

    const { data: ownedInspection, error: ownedInspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (ownedInspectionError || !ownedInspection) {
      redirect("/reports");
    }

    const { data: companyUser } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyUser?.company_id) {
      redirect(`/reports/${inspectionId}?sample_error=no_company`);
    }

    const serviceSupabase = createSupabaseStorageClient() || supabase;

    const { error: sampleError } = await serviceSupabase
      .from("public_sample_reports")
      .upsert(
        {
          company_id: companyUser.company_id,
          inspection_id: Number(inspectionId),
          title: getSampleReportTitle(ownedInspection),
          description: getSampleReportDescription(ownedInspection),
          cover_image_url: getSampleReportCoverUrl(ownedInspection),
          share_url: shareUrl,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,inspection_id" },
      );

    if (sampleError) {
      console.error("Add sample report error:", sampleError);
      redirect(`/reports/${inspectionId}?sample_error=1`);
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath("/inspectors");
    redirect(`/reports/${inspectionId}?sample_added=1`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (inspectionError || !inspection) redirect("/reports");

  // Use the service-role storage client only after ownership is verified.
  // This keeps the inspector editor private while signing every attached finding photo/video
  // the same reliable way the public share report does.
  const storageSupabase = createSupabaseStorageClient() || supabase;

  const executiveSummary = String(inspection.executive_summary || "").trim();

  const [emailLogsResult, viewLogsResult, equipmentResult, findingsResult] =
    await Promise.all([
      loadEmailLogs(supabase, inspection.id),
      supabase
        .from("inspection_view_events")
        .select("*")
        .eq("inspection_id_bigint", Number(inspection.id))
        .order("created_at", { ascending: false }),
      supabase
        .from("equipment_inventory")
        .select("*")
        .eq("inspection_id", inspection.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("findings")
        .select("*")
        .eq("inspection_id", inspection.id)
        .order("created_at", { ascending: true }),
    ]);

  if (emailLogsResult.error) {
    console.error("Email logs load error:", emailLogsResult.error);
  }

  if (viewLogsResult.error) {
    console.error("Inspection view logs load error:", viewLogsResult.error);
  }

  if (equipmentResult.error) {
    console.error("Equipment inventory load error:", equipmentResult.error);
  }

  if (findingsResult.error) {
    console.error("Findings load error:", findingsResult.error);
  }

  const emailLogs = emailLogsResult.data || [];
  const viewLogs = viewLogsResult.data || [];
  const equipmentInventoryRaw = equipmentResult.data || [];
  const findingsRaw = findingsResult.data || [];

  const { data: repairRequestSharesRaw, error: repairRequestSharesError } = await supabase
    .from("repair_request_shares")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: false });

  if (repairRequestSharesError) {
    console.error("Repair request history load error:", repairRequestSharesError);
  }

  const repairRequestShares = repairRequestSharesRaw || [];
  const repairRequestShareIds = repairRequestShares.map((share: any) => share.id).filter(Boolean);

  const { data: repairRequestResponsesRaw, error: repairRequestResponsesError } =
    repairRequestShareIds.length > 0
      ? await supabase
          .from("repair_request_responses")
          .select("*")
          .in("share_id", repairRequestShareIds)
      : { data: [], error: null };

  if (repairRequestResponsesError) {
    console.error("Repair request response history load error:", repairRequestResponsesError);
  }

  const repairResponsesByShareId = (repairRequestResponsesRaw || []).reduce(
    (acc: Record<string, any[]>, response: any) => {
      const shareId = String(response.share_id || "");
      if (!shareId) return acc;
      if (!acc[shareId]) acc[shareId] = [];
      acc[shareId].push(response);
      return acc;
    },
    {},
  );

  const repairRequestHistory = repairRequestShares.map((share: any, index: number) => {
    const responses = repairResponsesByShareId[String(share.id)] || [];
    const requestedCredit = getRepairRequestRequestedCredit(share);
    const sellerOffered = responses.reduce(
      (sum: number, response: any) =>
        sum +
        parseRepairMoneyValue(
          response?.seller_credit_amount ??
            response?.credit_amount ??
            response?.metadata?.seller_credit_amount ??
            0
        ),
      0,
    );
    const status = getRepairRequestStatus(share, responses.length);

    return {
      share,
      label: getRepairRequestLabel(index, repairRequestShares.length),
      responses,
      status,
      requestedCredit,
      sellerOffered,
      difference: sellerOffered - requestedCredit,
      selectedCount: getRepairRequestSelectedCount(share),
    };
  });

  const repairRequestHistoryBadge =
    repairRequestHistory.length > 0
      ? `${repairRequestHistory.length} request${repairRequestHistory.length === 1 ? "" : "s"}`
      : "None yet";

  const latestAgreementEmail =
    getLatestEmailLog(emailLogs, "agreement_email") ||
    getLatestEmailLog(emailLogs, "agreement_reminder") ||
    getLatestEmailLog(emailLogs, "agreement_reminder_email");
  const latestReportEmail =
    getLatestEmailLog(emailLogs, "inspection_report") ||
    getLatestEmailLog(emailLogs, "environmental_report");

  const agreementPageViews = getViewLogsByType(viewLogs, "agreement_page");
  const agreementReminderPageViews = getViewLogsByType(
    viewLogs,
    "agreement_reminder_page",
  );
  const clientPortalViews = getViewLogsByType(viewLogs, "client_portal");
  const reportShareViews = getViewLogsByType(viewLogs, "report_share");
  const environmentalShareViews = getViewLogsByType(
    viewLogs,
    "environmental_share",
  );

  const emailOpenViews = getViewLogsByType(viewLogs, "email_open");
  const emailClickViews = getViewLogsByType(viewLogs, "email_click");
  const reportTimeCheckpoints = getViewLogsByType(
    viewLogs,
    "report_time_checkpoint",
  );
  const reportTimeFinals = getViewLogsByType(viewLogs, "report_time_final");
  const reportTimeEvents = [...reportTimeCheckpoints, ...reportTimeFinals];
  const totalReportTimeSeconds = reportTimeFinals.reduce(
    (sum: number, log: any) => sum + getDurationSeconds(log),
    0,
  );
  const latestReportTimeEvent = reportTimeEvents[0] || null;

  const latestAgreementPageView = agreementPageViews[0] || null;
  const latestAgreementReminderPageView = agreementReminderPageViews[0] || null;
  const latestClientPortalView = clientPortalViews[0] || null;
  const latestReportShareView = reportShareViews[0] || null;
  const latestEnvironmentalShareView = environmentalShareViews[0] || null;
  const latestEmailOpenView = emailOpenViews[0] || null;
  const latestEmailClickView = emailClickViews[0] || null;

  const engagementViews = [
    ...emailOpenViews,
    ...emailClickViews,
    ...reportTimeEvents,
    ...agreementPageViews,
    ...agreementReminderPageViews,
    ...clientPortalViews,
    ...reportShareViews,
    ...environmentalShareViews,
  ];

  const firstEngagementView = getFirstViewLog(engagementViews);
  const latestEngagementView = engagementViews[0] || null;
  const uniqueViewerCount = getUniqueViewerCount(engagementViews);
  const viewerActivitySummary = getViewerActivitySummary(engagementViews);

  const clientViewerEmail = normalizeEmail(inspection.client_email);
  const realtorViewerEmails = [
    normalizeEmail(inspection.realtor_email),
    normalizeEmail(inspection.agent_email),
  ].filter(Boolean);

  const clientEngagementViews = engagementViews.filter((log: any) =>
    isClientViewLog(log, clientViewerEmail),
  );
  const realtorEngagementViews = engagementViews.filter((log: any) =>
    isRealtorViewLog(log, realtorViewerEmails),
  );

  const firstClientView = getFirstViewLog(clientEngagementViews);
  const latestClientView = getLatestViewLogFromList(clientEngagementViews);
  const firstRealtorView = getFirstViewLog(realtorEngagementViews);
  const latestRealtorView = getLatestViewLogFromList(realtorEngagementViews);
  const clientReadingSeconds = getFinalReadingSeconds(clientEngagementViews);
  const realtorReadingSeconds = getFinalReadingSeconds(realtorEngagementViews);

  const findingIds = findingsRaw.map((finding: any) => finding.id);

  const { data: photosRaw, error: photosError } =
    findingIds.length > 0
      ? await supabase.from("photos").select("*").in("finding_id", findingIds)
      : { data: [], error: null };

  if (photosError) console.error("Photos load error:", photosError);

  // PERFORMANCE + IMAGE FIX:
  // The editable report uses a private Supabase storage bucket in some installs.
  // Public-looking URLs can fail in the editor, which causes broken thumbnails.
  // Sign thumbnail paths in small batches so cards show images immediately without
  // forcing the page to transform/sign every full-size photo before render.
  const rawPhotos = photosRaw || [];

  const thumbnailPaths = rawPhotos
    .map((photo: any) => photo.thumbnail_path || photo.thumbnail_storage_path || "")
    .filter(Boolean);

  const fullPhotoPaths = rawPhotos
    .map((photo: any) => getPhotoStoragePath(photo))
    .filter(Boolean);

  const imagePreviewPaths = rawPhotos
    .map((photo: any) => {
      const path = getPhotoStoragePath(photo);
      return path && !isVideoPhotoFile(photo, path) ? path : "";
    })
    .filter(Boolean);

  // IMPORTANT: sign original media paths WITHOUT image transforms for the full URL
  // so videos keep working. For previews, use a transformed signed URL from the
  // original image instead of relying on generated thumbnail rows that may not exist.
  const [signedThumbnailMap, signedFullMediaMap, signedImagePreviewMap] = await Promise.all([
    createSignedRawUrlMap(storageSupabase, thumbnailPaths),
    createSignedRawUrlMap(storageSupabase, fullPhotoPaths),
    createSignedUrlMap(storageSupabase, imagePreviewPaths),
  ]);

  const getEquipmentStoragePath = (item: any) =>
    item?.file_path ||
    item?.storage_path ||
    item?.photo_path ||
    item?.image_path ||
    getStoragePathFromUrl(item?.image_url) ||
    getStoragePathFromUrl(item?.public_url) ||
    getStoragePathFromUrl(item?.photo_url) ||
    "";

  const getEquipmentThumbnailPath = (item: any) =>
    item?.thumbnail_path ||
    item?.thumbnail_storage_path ||
    getStoragePathFromUrl(item?.thumbnail_url) ||
    getStoragePathFromUrl(item?.thumbnail_public_url) ||
    "";

  const equipmentImagePaths = equipmentInventoryRaw
    .map((item: any) => getEquipmentStoragePath(item))
    .filter(Boolean);

  const equipmentThumbnailPaths = equipmentInventoryRaw
    .map((item: any) => getEquipmentThumbnailPath(item))
    .filter(Boolean);

  const [equipmentSignedImageMap, equipmentSignedThumbnailMap] = await Promise.all([
    createSignedRawUrlMap(storageSupabase, equipmentImagePaths),
    createSignedRawUrlMap(storageSupabase, equipmentThumbnailPaths),
  ]);

  const equipmentInventory = equipmentInventoryRaw.map((item: any) => {
    const imagePath = getEquipmentStoragePath(item);
    const thumbnailPath = getEquipmentThumbnailPath(item);

    const existingImageUrl =
      item.signed_image_url ||
      item.image_url ||
      item.public_url ||
      item.photo_url ||
      "";

    const existingThumbnailUrl =
      item.signed_thumbnail_url ||
      item.thumbnail_url ||
      item.thumbnail_public_url ||
      "";

    return {
      ...item,
      signed_thumbnail_url:
        equipmentSignedThumbnailMap[thumbnailPath] ||
        existingThumbnailUrl ||
        "",
      signed_image_url:
        equipmentSignedImageMap[imagePath] ||
        existingImageUrl ||
        "",
    };
  });

  const photosWithUrls = rawPhotos.map((photo: any) => {
    const fullPath = getPhotoStoragePath(photo);
    const thumbnailPath = photo.thumbnail_path || photo.thumbnail_storage_path || "";
    const signedFullUrl = signedFullMediaMap[fullPath] || "";
    const signedThumbnailUrl = signedThumbnailMap[thumbnailPath] || "";
    const existingFullUrl = getPhotoFallbackUrl(photo);
    const existingThumbnailUrl =
      photo.signed_thumbnail_url ||
      photo.thumbnail_url ||
      photo.thumbnail_public_url ||
      "";

    const finalFullUrl = signedFullUrl || photo.signed_url || existingFullUrl || "";

    return {
      ...photo,
      // Keep every signed variant because different report components look for
      // different keys. The inspector editor should never have to rely on a
      // public storage URL when a signed URL is available.
      signed_url: finalFullUrl,
      signedUrl: finalFullUrl,
      signed_video_url: finalFullUrl,
      signedVideoUrl: finalFullUrl,
      signed_thumbnail_url:
        signedImagePreviewMap[fullPath] ||
        signedThumbnailUrl ||
        existingThumbnailUrl ||
        finalFullUrl ||
        existingFullUrl ||
        "",
      signedThumbnailUrl:
        signedImagePreviewMap[fullPath] ||
        signedThumbnailUrl ||
        existingThumbnailUrl ||
        finalFullUrl ||
        existingFullUrl ||
        "",
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

  const findings = findingsRaw.map((finding: any) => {
    const imageUrl =
      finding.signed_image_url ||
      finding.public_image_url ||
      finding.image_url ||
      "";

    return {
      ...finding,
      section: normalizeSection(finding.section),
      signed_image_url: imageUrl || null,
      image_url: imageUrl || finding.image_url || null,
      photos: photosByFindingId[finding.id] || [],
    };
  });

  const numberedFindings = addRepairItemNumbers(findings);
  const findingsForEditor = numberedFindings.map((finding: any) => ({
    ...finding,
    title: getNumberedFindingTitle(finding),
  }));

  const groupedFindingsArray = SECTION_ORDER.map((section) => ({
    section,
    findings: findingsForEditor.filter((finding: any) => finding.section === section),
  }));

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

    return true;
  });

  const defectTotals = defectFindings.reduce(
    (acc: Record<string, number>, finding: any) => {
      const severity = String(
        finding.severity || "Recommended Repair",
      ).toLowerCase();

      const isInformational =
        severity.includes("information") ||
        severity.includes("info") ||
        severity.includes("client");

      if (isInformational) {
        acc.information += 1;
        return acc;
      }

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
      } else {
        acc.repair += 1;
      }

      return acc;
    },
    { total: 0, safety: 0, repair: 0, maintenance: 0, information: 0 },
  );

  const unresolvedSafetyFindings = defectFindings.filter((finding: any) => {
    const severity = String(finding.severity || "").toLowerCase();
    const reviewed =
      finding.command_center_reviewed === true ||
      finding.reviewed === true ||
      finding.resolved === true ||
      finding.is_resolved === true ||
      Boolean(finding.reviewed_at || finding.resolved_at || finding.closed_at);

    if (reviewed) return false;

    return (
      severity.includes("safety") ||
      severity.includes("hazard") ||
      severity.includes("major")
    );
  });

  const unresolvedSafetyFindingIds = unresolvedSafetyFindings
    .map((finding: any) => finding.id)
    .filter(Boolean);

  const rawPropertyPhoto =
    inspection.property_image ||
    inspection.street_view_url ||
    inspection.cover_photo_url ||
    inspection.google_photo_url ||
    inspection.property_photo_url ||
    inspection.place_photo_url ||
    inspection.photo_url ||
    inspection.image_url ||
    "";

  let propertyPhoto = rawPropertyPhoto;
  const propertyPhotoPath =
    inspection.property_photo_path ||
    inspection.property_image_path ||
    inspection.cover_photo_path ||
    inspection.street_view_path ||
    inspection.storage_path ||
    getStoragePathFromUrl(rawPropertyPhoto);

  if (propertyPhotoPath) {
    const { data: signedPropertyPhoto, error: signedPropertyPhotoError } = await storageSupabase.storage
      .from("inspection-photos")
      .createSignedUrl(propertyPhotoPath, 60 * 60 * 24 * 7);

    if (signedPropertyPhotoError) {
      console.error("Property photo signed URL error:", signedPropertyPhotoError);
    }

    if (signedPropertyPhoto?.signedUrl) {
      propertyPhoto = signedPropertyPhoto.signedUrl;
    }
  }

  const reportIsPublished =
    inspection.published === true ||
    String(inspection.report_status || "").toLowerCase() === "published";

  const publishGuardNeedsAttention =
    getSingleSearchParam(resolvedSearchParams, "publish_guard") === "blocked" ||
    getSingleSearchParam(resolvedSearchParams, "publish_guard_error") === "1" ||
    getSingleSearchParam(resolvedSearchParams, "publish_error") === "1";

  const engagementBadge =
    latestEngagementView
      ? `${engagementViews.length} view${engagementViews.length === 1 ? "" : "s"}`
      : "No views yet";

  const { data: existingSampleReport } = await supabase
    .from("public_sample_reports")
    .select("id, title, description, is_enabled")
    .eq("inspection_id", inspection.id)
    .maybeSingle();

  const sampleReportBadge =
    existingSampleReport?.is_enabled === true ? "Enabled" : "Disabled";

  const serviceType = String(
    inspection.service_mode ||
      inspection.inspection_type ||
      inspection.services ||
      "",
  ).toLowerCase();

  const isStandaloneEnvironmentalReport =
    serviceType.includes("radon_only") ||
    serviceType.includes("mold_only") ||
    serviceType.includes("radon_mold");

  const shareHref = isStandaloneEnvironmentalReport
    ? `/environmental-share/${inspection.id}`
    : `/share/${inspection.id}`;

  const editableEnvironmentalHref = `/environmental-report/${inspection.id}`;
  const sampleShareTitle = getSampleReportTitle(inspection);
  const sampleShareDescription = getSampleReportDescription(inspection);

  

  const { data: signedAgreementsRaw, error: signedAgreementsError } = await supabase
    .from("inspection_agreements")
    .select("id, contact_id, client_name, client_email, signature_role, agreement_title, signed_at, signer_ip, signer_user_agent, status")
    .eq("inspection_id", inspection.id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false });

  if (signedAgreementsError) {
    console.error("Signed agreements load error:", signedAgreementsError);
  }

  const signedAgreements = signedAgreementsRaw || [];

  const { data: agreementContactsRaw, error: agreementContactsError } = await supabase
    .from("inspection_contacts")
    .select("id, name, email, role, agreement_required, agreement_signed, signed_at")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  if (agreementContactsError) {
    console.error("Agreement contacts load error:", agreementContactsError);
  }

  const agreementContacts = agreementContactsRaw || [];
  const requiredAgreementContacts = agreementContacts.filter((contact: any) =>
    Boolean(contact.agreement_required)
  );
  const unsignedRequiredAgreementContacts = requiredAgreementContacts.filter(
    (contact: any) => !Boolean(contact.agreement_signed)
  );
  const allRequiredAgreementsSigned =
    requiredAgreementContacts.length > 0 && unsignedRequiredAgreementContacts.length === 0;
  const hasSignedAgreementRecord = signedAgreements.length > 0;
  const agreementComplete = requiredAgreementContacts.length > 0
    ? allRequiredAgreementsSigned
    : hasSignedAgreementRecord;
  const agreementStatusLabel = requiredAgreementContacts.length > 0
    ? allRequiredAgreementsSigned
      ? "All signed"
      : `${unsignedRequiredAgreementContacts.length} missing`
    : hasSignedAgreementRecord
      ? "Signed"
      : "Needs setup";
  const firstSignedAgreement = signedAgreements[0] || null;

  const { data: reportDisclaimersRaw, error: reportDisclaimersError } = await supabase
    .from("report_disclaimers")
    .select("id, topic, disclaimer_text")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  if (reportDisclaimersError) {
    console.error("Report disclaimers load error:", reportDisclaimersError);
  }

  const reportDisclaimers = reportDisclaimersRaw || [];
  const reportDisclaimerTopics = new Set(reportDisclaimers.map((row: any) => String(row.topic || "")));
  const inspectionYearBuilt = getInspectionYearBuilt(inspection);
  const inspectionWatchlistItems = [
    ...getAgeBasedWatchlistItems(inspectionYearBuilt),
    ...getFindingBasedWatchlistItems(numberedFindings),
  ].slice(0, 10);
  const suggestedDisclaimerTopics = getSuggestedDisclaimerTopicsForReport(inspectionYearBuilt, numberedFindings);
  const missingSuggestedDisclaimerTopics = suggestedDisclaimerTopics.filter(
    (topic) => !reportDisclaimerTopics.has(topic)
  );


  const paymentDueAmount = parseRepairMoneyValue(
    inspection.balance_due ??
      inspection.amount_due ??
      inspection.invoice_due ??
      inspection.payment_due ??
      inspection.due_amount ??
      inspection.due ??
      0
  );

  const paymentStatusText = String(
    inspection.payment_status ||
      inspection.paymentStatus ||
      inspection.invoice_status ||
      ""
  ).toLowerCase();

  const invoiceTotalForNotice = parseRepairMoneyValue(
    inspection.invoice_total ??
      inspection.invoice_amount ??
      inspection.price ??
      inspection.total_price ??
      inspection.fee ??
      0
  );

  const paymentNeedsAttention =
    paymentDueAmount > 0 ||
    (invoiceTotalForNotice > 0 &&
      !paymentStatusText.includes("paid") &&
      !paymentStatusText.includes("complete") &&
      !paymentStatusText.includes("waived"));

  const agreementNeedsAttention =
    Boolean(
      inspection.client_email ||
        inspection.client_name ||
        requiredAgreementContacts.length > 0 ||
        signedAgreements.length > 0
    ) && !agreementComplete;

  const repairResponsesReady = repairRequestHistory.filter((item: any) => {
    const status = String(item.status || "").toLowerCase();
    return status.includes("responded") || status.includes("seller") || status.includes("fully");
  });

  const repairResponseReadyCount = repairResponsesReady.length;
  const firstRepairResponseReady = repairResponsesReady[0] || null;

  const inspectorWorkspaceNotifications = [
    ...(paymentNeedsAttention
      ? [
          {
            id: "payment-due",
            title: "Payment needs attention",
            message:
              paymentDueAmount > 0
                ? `${formatRepairMoney(paymentDueAmount)} is still showing due before delivery.`
                : "Payment is not marked complete yet.",
            urgency: "critical" as const,
            badge: paymentDueAmount > 0 ? formatRepairMoney(paymentDueAmount) : "Due",
            targetAnchor: "payment-invoice",
          },
        ]
      : []),
    ...(agreementNeedsAttention
      ? [
          {
            id: "agreement-missing",
            title: requiredAgreementContacts.length > 0
              ? "Required agreement signature missing"
              : "Agreement signer setup needed",
            message: requiredAgreementContacts.length > 0
              ? `${unsignedRequiredAgreementContacts.length} required agreement signature${unsignedRequiredAgreementContacts.length === 1 ? "" : "s"} still need to be completed.`
              : "No required agreement signer is marked complete yet. Review agreement contacts and send the agreement if needed.",
            urgency: "critical" as const,
            badge: requiredAgreementContacts.length > 0 ? `${unsignedRequiredAgreementContacts.length} missing` : "Required",
            targetAnchor: "agreement-status",
          },
        ]
      : []),
    ...(publishGuardNeedsAttention
      ? [
          {
            id: "publish-guard",
            title: "Publish guard needs review",
            message: "The report was stopped or flagged before publishing. Review the guard details.",
            urgency: "critical" as const,
            badge: "Review",
            targetAnchor: "publish-guard",
          },
        ]
      : []),
    ...(unresolvedSafetyFindingIds.length > 0
      ? [
          {
            id: "safety-findings",
            title: "Safety items detected",
            message: `${unresolvedSafetyFindingIds.length} safety/major item${unresolvedSafetyFindingIds.length === 1 ? "" : "s"} should be reviewed before publishing.`,
            urgency: "warning" as const,
            badge: `${unresolvedSafetyFindingIds.length}`,
            targetAnchor: unresolvedSafetyFindingIds[0]
              ? `finding-${unresolvedSafetyFindingIds[0]}`
              : "report-findings",
            findingIds: unresolvedSafetyFindingIds,
          },
        ]
      : []),
    ...(missingSuggestedDisclaimerTopics.length > 0
      ? [
          {
            id: "suggested-disclaimers",
            title: "Suggested disclaimers ready",
            message: `${missingSuggestedDisclaimerTopics.length} AI recommended disclaimer${missingSuggestedDisclaimerTopics.length === 1 ? "" : "s"} should be reviewed before publishing.`,
            urgency: "warning" as const,
            badge: `${missingSuggestedDisclaimerTopics.length}`,
            targetAnchor: "report-disclaimers",
          },
        ]
      : []),
    ...(repairResponseReadyCount > 0
      ? [
          {
            id: "repair-response-ready",
            title: "Repair request update",
            message: `${repairResponseReadyCount} repair request${repairResponseReadyCount === 1 ? "" : "s"} have responses or signatures ready to review.`,
            urgency: "info" as const,
            badge: `${repairResponseReadyCount}`,
            targetAnchor: firstRepairResponseReady?.share?.id
              ? `repair-request-${firstRepairResponseReady.share.id}`
              : "repair-request-history",
            repairRequestId: firstRepairResponseReady?.share?.id,
          },
        ]
      : []),
  ] satisfies WorkspaceNotification[];

  const inspectorWorkspaceBadge =
    inspectorWorkspaceNotifications.length > 0
      ? `${inspectorWorkspaceNotifications.length}`
      : publishGuardNeedsAttention
        ? "Needs Attention"
        : defectTotals.total > 0
          ? `${defectTotals.total}`
          : "Ready";


  const inspectionProgressItems = [
    { label: "Report Items", complete: findings.length > 0 },
    { label: "Media", complete: photosWithUrls.length > 0 },
    { label: "Agreement", complete: agreementComplete },
    { label: "Payment", complete: !paymentNeedsAttention },
    { label: "Published", complete: reportIsPublished },
  ];

  const inspectionProgressCompleteCount = inspectionProgressItems.filter((item) => item.complete).length;
  const inspectionProgressPercent = Math.round(
    (inspectionProgressCompleteCount / inspectionProgressItems.length) * 100
  );

  const nextWorkspaceNotification = inspectorWorkspaceNotifications[0] || null;
  const nextWorkspaceText = `${nextWorkspaceNotification?.id || ""} ${nextWorkspaceNotification?.title || ""} ${nextWorkspaceNotification?.message || ""}`.toLowerCase();

  const nextWorkspaceAction =
    nextWorkspaceNotification && nextWorkspaceText.includes("agreement")
      ? {
          label: latestAgreementEmail ? "Send Reminder" : "Send Agreement",
          href: "#agreement-status",
          className: "border-red-400 bg-red-500/15 text-red-100 hover:bg-red-500/25",
          commandTool: "",
        }
      : !nextWorkspaceNotification && agreementComplete && firstSignedAgreement?.id
        ? {
            label: "View Signed Agreement",
            href: `/reports/${inspection.id}/signed-agreement/${firstSignedAgreement.id}`,
            className: "border-emerald-400 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
            commandTool: "",
          }
      : nextWorkspaceNotification && nextWorkspaceText.includes("payment")
        ? {
            label: "Check Invoice",
            href: "#payment-invoice",
            className: "border-red-400 bg-red-500/15 text-red-100 hover:bg-red-500/25",
            commandTool: "",
          }
        : nextWorkspaceNotification && nextWorkspaceText.includes("publish")
          ? {
              label: "Review Publish Guard",
              href: "#",
              className: "border-yellow-400 bg-yellow-500/15 text-yellow-100 hover:bg-yellow-500/25",
              commandTool: "Final Publish Guard",
            }
          : nextWorkspaceNotification && (nextWorkspaceText.includes("safety") || nextWorkspaceText.includes("finding"))
            ? {
                label: "Review Findings",
                href: "#report-findings",
                className: "border-yellow-400 bg-yellow-500/15 text-yellow-100 hover:bg-yellow-500/25",
                commandTool: "",
              }
            : nextWorkspaceNotification && nextWorkspaceText.includes("repair")
              ? {
                  label: "Review Repair Request",
                  href: "#repair-request-history",
                  className: "border-cyan-400 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25",
                  commandTool: "",
                }
              : {
                  label: reportIsPublished ? "Open Client Preview" : "Continue Inspection",
                  href: reportIsPublished ? `/share/${inspection.id}` : `/field?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`,
                  className: "border-teal-400 bg-teal-500/15 text-teal-100 hover:bg-teal-500/25",
                  commandTool: "",
                };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] pb-[calc(100px+env(safe-area-inset-bottom))] text-white">
      <OfflineReportCacheBridge
        inspectionId={String(inspection.id)}
        inspection={inspection}
        groupedFindings={groupedFindingsArray}
        sections={SECTION_ORDER}
        clientInfo={inspection}
      />
      <div className="mx-auto w-full max-w-none px-1 py-2 sm:px-2 md:px-4 lg:max-w-7xl lg:py-8">
        <div className="mb-4 overflow-x-hidden overflow-y-visible rounded-2xl border border-slate-800 bg-[#0f172a] p-1.5 shadow-xl sm:p-3 md:rounded-3xl md:p-6">
          <div className="mb-6 flex max-w-full flex-wrap gap-3 overflow-x-hidden overflow-y-visible">
            <PrintButton
              label="Print / Save PDF"
              className="rounded-xl bg-black px-5 py-3 font-bold text-white hover:bg-slate-800"
            />

            <FastLinkButton
              href={`/reports/${inspection.id}/print`}
              loadingText="Opening PDF..."
              className="rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-slate-200"
            >
              Export PDF
            </FastLinkButton>

            <FastLinkButton
              href={`/reports/${inspection.id}/summary`}
              loadingText="Opening Summary..."
              className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
            >
              Realtor Summary
            </FastLinkButton>

            <PublishReportActionButton
              action={publishReport}
              inspectionId={String(inspection.id)}
              published={reportIsPublished}
            />

            <FastLinkButton
              href={shareHref}
              loadingText="Opening Share Page..."
              className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
            >
              Copy Share Link
            </FastLinkButton>

            <CreateDemoReportButton inspectionId={String(inspection.id)} />

            {isStandaloneEnvironmentalReport && (
              <FastLinkButton
                href={editableEnvironmentalHref}
                loadingText="Opening Environmental Report..."
                className="rounded-xl border border-lime-500 px-5 py-3 font-bold text-lime-300 hover:bg-lime-500/10"
              >
                Environmental Report
              </FastLinkButton>
            )}

            <FastLinkButton
              href={`/client-portal/${inspection.id}`}
              loadingText="Opening Client Portal..."
              className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 hover:bg-emerald-500/10"
            >
              Client Portal
            </FastLinkButton>

            <SendFullReportButton
              inspectionId={String(inspection.id)}
              clientEmail={inspection.client_email}
              realtorEmail={inspection.realtor_email || inspection.agent_email}
            />

            <SendReviewRequestButton
              inspectionId={String(inspection.id)}
              clientEmail={inspection.client_email}
              reviewStatus={inspection.review_status}
            />

            <FastLinkButton
              href={`/repair-request?inspection_id=${inspection.id}`}
              loadingText="Opening Repair Request..."
              className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-500"
            >
              Repair Request Builder
            </FastLinkButton>

            <SendAgreementButton inspectionId={String(inspection.id)} />

            <InsertFavoriteFindingButton inspectionId={String(inspection.id)} />

            <FastLinkButton
              href={`/reports/${inspection.id}/templates`}
              loadingText="Opening Library..."
              className="rounded-xl border border-yellow-500 px-5 py-3 font-bold text-yellow-300 hover:bg-yellow-500/10"
            >
              Favorite Findings Library
            </FastLinkButton>

            <OneTapAIFindingInsert inspectionId={String(inspection.id)} />

            <FastLinkButton
              href={`/field?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              loadingText="Opening Field Tool..."
              className="rounded-xl border border-teal-500 bg-[#071224] px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Field Tool
            </FastLinkButton>

            <FastLinkButton
              href={`/ai-capture?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              loadingText="Opening AI Capture..."
              className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
            >
              Open Full AI Capture
            </FastLinkButton>

            <FastLinkButton
              href={`/reports/${inspection.id}/bulk-ai-capture`}
              loadingText="Opening Bulk AI..."
              className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-500"
            >
              📸 Bulk AI Capture
            </FastLinkButton>

            <FastLinkButton
              href={`/equipment-analyzer?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              loadingText="Opening Equipment Analyzer..."
              className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 hover:bg-blue-500/10"
            >
              Equipment Analyzer
            </FastLinkButton>
          </div>

          <div className="mb-8 rounded-2xl border border-yellow-500 bg-yellow-950/30 p-4 text-yellow-200">
            <h2 className="text-2xl font-black">Report Tools</h2>
            <p className="mt-2">
              All report tools are enabled, including Send Report, Realtor
              Summary, email, agreements, Copy Share Link, Favorite Findings
              Library, Insert Favorite Finding, One-Tap AI, Field Tool, Full AI
              Capture, Equipment Analyzer, repair requests, and findings.
            </p>
          </div>

          <CollapsibleReportSection
            title="AI Inspection Watchlist"
            subtitle={
              inspectionWatchlistItems.length > 0
                ? `${inspectionWatchlistItems.length} item${inspectionWatchlistItems.length === 1 ? "" : "s"} to review before you finish`
                : "No watchlist items yet"
            }
            accentClassName="border-cyan-500/40 text-cyan-100"
          >
          <section className="mb-8 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-5 shadow-xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  AI Inspection Watchlist
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Be on the lookout before you finish this report
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {inspectionYearBuilt
                    ? `This home was reportedly built in ${inspectionYearBuilt}. The system is watching for age-related risks, finding-based limitations, and disclaimers you may want to add.`
                    : "Add or auto-fill the year built to unlock age-based watchlist items and disclaimer suggestions."}
                </p>
              </div>

              <a
                href="#report-disclaimers"
                className="w-fit rounded-xl border border-cyan-300 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-400/20"
              >
                Review Disclaimers
              </a>
            </div>

            {inspectionWatchlistItems.length > 0 ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {inspectionWatchlistItems.map((item: any, index: number) => (
                  <div
                    key={`${item.title}-${index}`}
                    className="rounded-xl border border-cyan-400/30 bg-[#020617] p-4"
                  >
                    <p className="text-base font-black text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-cyan-100">{item.reason}</p>
                    {item.tips?.length ? (
                      <ul className="mt-3 space-y-1 text-xs font-bold leading-5 text-slate-300">
                        {item.tips.map((tip: string) => (
                          <li key={tip}>✓ {tip}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-700 bg-[#020617] p-4 text-sm font-bold text-slate-300">
                No age-based watchlist items yet. Add the year built or continue documenting findings.
              </div>
            )}
          </section>
          </CollapsibleReportSection>

          <div id="report-disclaimers" data-command-target="report-disclaimers" className="mb-8">
            <ReportDisclaimers inspectionId={String(inspection.id)} />
          </div>

          <section className="mb-8 overflow-hidden rounded-[2rem] border border-teal-400/30 bg-gradient-to-br from-[#071224] via-[#071224] to-[#020617] p-5 shadow-xl sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-300">
                  Inspection Workspace
                </p>

                <h2 className="mt-2 break-words text-3xl font-black text-white sm:text-4xl">
                  {inspection.address || "Current Inspection"}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Finish the inspection, clear blockers, deliver the report, and manage the transaction from one home base.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <span
                  className={`rounded-full border px-4 py-2 text-sm font-black ${
                    reportIsPublished
                      ? "border-green-400/70 bg-green-500/10 text-green-300"
                      : "border-yellow-400/70 bg-yellow-500/10 text-yellow-200"
                  }`}
                >
                  {reportIsPublished ? "Published" : "In Progress"}
                </span>

                <span
                  className={`rounded-full border px-4 py-2 text-sm font-black ${
                    inspectorWorkspaceNotifications.length > 0
                      ? "border-red-400/70 bg-red-500/10 text-red-200"
                      : "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {inspectorWorkspaceNotifications.length > 0
                    ? `${inspectorWorkspaceNotifications.length} alert${inspectorWorkspaceNotifications.length === 1 ? "" : "s"}`
                    : "Ready"}
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-black/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    Inspection Progress
                  </p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {inspectionProgressPercent}%
                  </p>
                </div>

                <p className="text-sm font-bold text-slate-400">
                  {inspectionProgressCompleteCount} of {inspectionProgressItems.length} checkpoints complete
                </p>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${
                    inspectionProgressPercent >= 100
                      ? "bg-emerald-400"
                      : inspectionProgressPercent >= 60
                        ? "bg-teal-400"
                        : "bg-yellow-400"
                  }`}
                  style={{ width: `${inspectionProgressPercent}%` }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {inspectionProgressItems.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-xl border px-3 py-2 text-sm font-black ${
                      item.complete
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                        : "border-yellow-400/50 bg-yellow-500/10 text-yellow-100"
                    }`}
                  >
                    {item.complete ? "✓" : "⚠"} {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-700 bg-black/30 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Total Items
                </p>
                <p className="mt-2 text-3xl font-black text-white">{findings.length}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">All report entries</p>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-black/30 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Media
                </p>
                <p className="mt-2 text-3xl font-black text-white">{photosWithUrls.length}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Photos and videos</p>
              </div>

              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-red-200">
                  Safety / Major
                </p>
                <p className="mt-2 text-3xl font-black text-white">{defectTotals.safety}</p>
                <p className="mt-1 text-xs font-bold text-red-100/70">Priority concerns</p>
              </div>

              <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-orange-200">
                  Client Summary
                </p>
                <p className="mt-2 text-3xl font-black text-white">{defectTotals.total}</p>
                <p className="mt-1 text-xs font-bold text-orange-100/70">Defects shown to client</p>
              </div>

              <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-purple-200">
                  Repair Requests
                </p>
                <p className="mt-2 text-3xl font-black text-white">{repairRequestHistory.length}</p>
                <p className="mt-1 text-xs font-bold text-purple-100/70">Negotiation history</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                Next Best Action
              </p>

              {nextWorkspaceNotification ? (
                <div className="mt-3 rounded-2xl border border-red-400/50 bg-red-500/10 p-4">
                  <p className="text-xl font-black text-white">
                    {nextWorkspaceNotification.title || "Review report alert"}
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-red-100/80">
                    {nextWorkspaceNotification.message || "Open the Command Center and clear this before delivery."}
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4">
                  <p className="text-xl font-black text-white">No active blockers</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-emerald-100/80">
                    Keep writing the report or use the delivery tools when you are ready.
                  </p>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {nextWorkspaceAction.commandTool ? (
                  <OpenCommandCenterToolButton
                    toolTitle={nextWorkspaceAction.commandTool}
                    className={`inline-flex min-h-[48px] items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-black transition active:scale-[0.98] ${nextWorkspaceAction.className}`}
                  >
                    {nextWorkspaceAction.label}
                  </OpenCommandCenterToolButton>
                ) : (
                  <a
                    href={nextWorkspaceAction.href}
                    className={`inline-flex min-h-[48px] items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-black transition active:scale-[0.98] ${nextWorkspaceAction.className}`}
                  >
                    {nextWorkspaceAction.label}
                  </a>
                )}

                <a
                  href="#agreement-status"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-center text-sm font-black text-slate-200 transition hover:border-teal-400/60 hover:bg-teal-500/10 active:scale-[0.98]"
                >
                  Agreement: {agreementStatusLabel}
                </a>

                <a
                  href="#payment-invoice"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-center text-sm font-black text-slate-200 transition hover:border-teal-400/60 hover:bg-teal-500/10 active:scale-[0.98]"
                >
                  Payment
                </a>

                <OpenCommandCenterToolButton
                  toolTitle="Final Publish Guard"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-center text-sm font-black text-slate-200 transition hover:border-teal-400/60 hover:bg-teal-500/10 active:scale-[0.98]"
                >
                  Publish Guard
                </OpenCommandCenterToolButton>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FastLinkButton
                href={`/field?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
                loadingText="Opening Field Tool..."
                className="rounded-xl bg-teal-500 px-4 py-3 text-center font-black text-slate-950 shadow-lg shadow-teal-950/20 hover:bg-teal-400"
              >
                Continue Inspection
              </FastLinkButton>

              <FastLinkButton
                href={`/share/${inspection.id}`}
                loadingText="Opening Preview..."
                className="rounded-xl border border-blue-500 bg-blue-500/10 px-4 py-3 text-center font-black text-blue-300 hover:bg-blue-500/20"
              >
                Client Preview
              </FastLinkButton>

              <FastLinkButton
                href={`/repair-request?inspection_id=${inspection.id}`}
                loadingText="Opening Repair Request..."
                className="rounded-xl border border-orange-500 bg-orange-500/10 px-4 py-3 text-center font-black text-orange-300 hover:bg-orange-500/20"
              >
                Repair Request
              </FastLinkButton>

              <a
                href={`/reports/${inspection.id}/print`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-purple-500 bg-purple-500/10 px-4 py-3 text-center font-black text-purple-300 transition hover:bg-purple-500/20 active:scale-[0.98]"
              >
                PDF / Print
              </a>
            </div>
          </section>

          <InspectorToolsDrawer
            badge={inspectorWorkspaceBadge}
            notifications={inspectorWorkspaceNotifications}
            items={[
              {
                title: "Repair Request History",
                helper: "All requests and responses",
                badge: repairRequestHistoryBadge,
                tone: "green",
              },
              {
                title: "AI Report Review",
                helper: "AI safety review",
                badge: defectTotals.total > 0 ? `${defectTotals.total} defects` : "Ready",
                tone: "purple",
              },
              {
                title: "House Intelligence",
                helper: "Property memory and history",
                badge: "Memory",
                tone: "emerald",
              },
              {
                title: "Live AI Inspector Assistant",
                helper: "Missing items and publish readiness",
                badge: unresolvedSafetyFindingIds.length > 0 ? `${unresolvedSafetyFindingIds.length} safety` : "AI checks",
                tone: "yellow",
              },
              {
                title: "Connected Finding Intelligence",
                helper: "Related defects and systems",
                badge: "Related findings",
                tone: "blue",
              },
              {
                title: "AI Activity Timeline",
                helper: "Inspection activity log",
                badge: `${findings.length} findings`,
                tone: "violet",
              },
              {
                title: "AI Disclaimer Assistant",
                helper: "Age and finding based disclaimer suggestions",
                badge: missingSuggestedDisclaimerTopics.length > 0 ? `${missingSuggestedDisclaimerTopics.length} suggested` : `${reportDisclaimers.length} added`,
                tone: missingSuggestedDisclaimerTopics.length > 0 ? "yellow" : "emerald",
              },
              {
                title: "Final Publish Guard",
                helper: "Review before publishing",
                badge: reportIsPublished ? "Complete" : publishGuardNeedsAttention ? "Needs Attention" : "Review Before Publish",
                tone: publishGuardNeedsAttention ? "red" : "yellow",
              },
              {
                title: "Sample Report",
                helper: "Public profile preview",
                badge: sampleReportBadge,
                tone: existingSampleReport?.is_enabled === true ? "emerald" : "slate",
              },
              {
                title: "Report Engagement",
                helper: "Email opens, views, and reading time",
                badge: engagementBadge,
                tone: "cyan",
              },
            ]}
          >
          <div id="repair-request-history" data-command-target="repair-request-history">
          <AttentionPanel
            title="Repair Request History"
            eyebrow="Negotiation"
            badge={repairRequestHistoryBadge}
            helper="Every repair request stays saved here. Open older requests, check requested credit, seller credit, status, and download the executed addendum."
            defaultOpen={repairRequestHistory.length > 0}
          >
            {repairRequestHistory.length > 0 ? (
              <div className="space-y-3">
                {repairRequestHistory.map((item: any) => {
                  const share = item.share;
                  const selectedParam = Array.isArray(share.selected_finding_ids)
                    ? share.selected_finding_ids.join(",")
                    : "";
                  const repairBuilderHref = `/repair-request?inspection_id=${inspection.id}${
                    selectedParam ? `&selected=${encodeURIComponent(selectedParam)}` : ""
                  }&share=${encodeURIComponent(String(share.id || ""))}`;
                  const responseHref = share.token ? `/repair-response/${share.token}` : "";
                  const addendumHref = share.token ? `/api/repair-request-addendum/${share.token}` : "";
                  const downloadHref = share.token
                    ? `/api/repair-request-addendum/${share.token}?download=1`
                    : "";
                  const recipient = String(share.recipient_email || "Unknown recipient");

                  return (
                    <div
                      key={share.id || share.token}
                      id={share.id ? `repair-request-${share.id}` : undefined}
                      data-command-target={share.id ? `repair-request-${share.id}` : undefined}
                      className="rounded-2xl border border-slate-700 bg-[#020617] p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-orange-400/60 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-200">
                              {item.label}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${getRepairRequestStatusClass(item.status)}`}>
                              {item.status}
                            </span>
                          </div>

                          <p className="mt-3 break-words text-sm font-bold text-slate-300">
                            Sent to: <span className="text-white">{recipient}</span>
                          </p>
                          <p className="mt-1 break-words text-sm font-bold text-slate-300">
                            Created by: <span className="text-white">{getRepairRequestCreatorLabel(share)}</span>
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            Created {formatEmailStatusDate(share.created_at)}
                            {share.responded_at ? ` • Responded ${formatEmailStatusDate(share.responded_at)}` : ""}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                          <div className="rounded-xl border border-slate-700 bg-[#071224] p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                              Items
                            </p>
                            <p className="mt-1 text-lg font-black text-white">{item.selectedCount}</p>
                          </div>
                          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">
                              Requested
                            </p>
                            <p className="mt-1 text-lg font-black text-white">
                              {formatRepairMoney(item.requestedCredit)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-emerald-200">
                              Seller
                            </p>
                            <p className="mt-1 text-lg font-black text-white">
                              {item.responses.length ? formatRepairMoney(item.sellerOffered) : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-purple-200">
                              Difference
                            </p>
                            <p className={`mt-1 text-lg font-black ${
                              item.difference < 0
                                ? "text-red-200"
                                : item.difference > 0
                                  ? "text-emerald-200"
                                  : "text-white"
                            }`}>
                              {item.responses.length ? formatRepairMoney(item.difference) : "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <FastLinkButton
                          href={repairBuilderHref}
                          loadingText="Opening Request..."
                          className="rounded-xl border border-orange-500 bg-orange-500/10 px-4 py-3 text-center text-sm font-black text-orange-200 hover:bg-orange-500/20"
                        >
                          Open Request
                        </FastLinkButton>

                        {responseHref ? (
                          <FastLinkButton
                            href={responseHref}
                            loadingText="Opening Response..."
                            className="rounded-xl border border-teal-500 bg-teal-500/10 px-4 py-3 text-center text-sm font-black text-teal-200 hover:bg-teal-500/20"
                          >
                            Open Response
                          </FastLinkButton>
                        ) : null}

                        {addendumHref ? (
                          <a
                            href={addendumHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-purple-500 bg-purple-500/10 px-4 py-3 text-center text-sm font-black text-purple-200 transition hover:bg-purple-500/20 active:scale-[0.98]"
                          >
                            Open Addendum
                          </a>
                        ) : null}

                        {downloadHref ? (
                          <a
                            href={downloadHref}
                            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-cyan-500 bg-cyan-500/10 px-4 py-3 text-center text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-[#020617] p-4 text-sm font-bold text-slate-300">
                No repair requests have been sent for this inspection yet. Use the Repair Request Builder to create the first one.
              </div>
            )}
          </AttentionPanel>
          </div>

          <div id="ai-report-review" data-command-target="ai-report-review">
          <AttentionPanel
            title="AI Report Review"
            badge={defectTotals.total > 0 ? `${defectTotals.total} defects` : "Ready"}
            helper="Collapsed by default. Open when you want the full AI report safety review."
          >
            <AIReportReviewPanel inspectionId={String(inspection.id)} />
          </AttentionPanel>
          </div>

          <AttentionPanel
            title="House Intelligence"
            badge="Memory"
            helper="Property history, repeated concerns, and house-specific intelligence."
          >
            <LiveHouseIntelligencePanel inspectionId={String(inspection.id)} />
          </AttentionPanel>

          <AttentionPanel
            title="Live AI Inspector Assistant"
            badge={defectTotals.safety > 0 ? `${defectTotals.safety} safety` : "AI checks"}
            helper="Open this when the badge suggests missing items, contradictions, or publish-readiness concerns."
          >
            <InspectionCopilotPanel inspectionId={String(inspection.id)} />
          </AttentionPanel>

          <AttentionPanel
            title="Connected Finding Intelligence"
            badge="Related findings"
            helper="Possible relationships between defects, systems, and recommended next steps."
          >
            <HouseRelationshipPanel inspectionId={String(inspection.id)} />
          </AttentionPanel>

          <AttentionPanel
            title="AI Activity Timeline"
            badge={`${findings.length} findings`}
            helper="Live activity log. Open when you need to audit what changed during the inspection."
          >
            <LiveInspectionTimelinePanel inspectionId={String(inspection.id)} />
          </AttentionPanel>

          <div id="publish-guard" data-command-target="publish-guard">
          <AttentionPanel
            title="Final Publish Guard"
            badge={reportIsPublished ? "Complete" : publishGuardNeedsAttention ? "Needs Attention" : "Review Before Publish"}
            helper="Collapsed by default. It opens automatically only when publishing is blocked or errors need attention."
            defaultOpen={publishGuardNeedsAttention}
          >
            <AIPublishGuardPanel inspectionId={String(inspection.id)} />
          </AttentionPanel>
          </div>

          <AttentionPanel
            title="Sample Report"
            eyebrow="Public Profile"
            badge={sampleReportBadge}
            helper="Open only when you need to add or update this inspection as a public sample report."
          >
            <SampleReportManager
              inspectionId={String(inspection.id)}
              initialEnabled={existingSampleReport?.is_enabled === true}
              initialTitle={existingSampleReport?.title || sampleShareTitle}
              initialDescription={existingSampleReport?.description || sampleShareDescription}
              shareUrl={shareHref}
            />
          </AttentionPanel>

          <AttentionPanel
            title="Report Engagement"
            eyebrow="Client Activity"
            badge={engagementBadge}
            helper="Collapsed by default to keep the report editor fast. Open to review email opens, link clicks, client/realtor views, and reading time."
          >

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <EngagementStatCard
                label="Total Views"
                value={String(engagementViews.length)}
                helper="All tracked report, portal, agreement, reminder, and environmental opens"
              />

              <EngagementStatCard
                label="Unique Viewers"
                value={String(uniqueViewerCount)}
                helper="Based on available email, contact, role, or IP data"
              />

              <EngagementStatCard
                label="Time Spent"
                value={formatDuration(totalReportTimeSeconds)}
                helper={
                  latestReportTimeEvent
                    ? `Last session update: ${formatEmailStatusDate(
                        latestReportTimeEvent.created_at,
                      )}`
                    : "No tracked reading time yet"
                }
              />

              <EngagementStatCard
                label="First Viewed"
                value={formatEmailStatusDate(firstEngagementView?.created_at)}
                helper={firstEngagementView?.view_type || "No views yet"}
              />

              <EngagementStatCard
                label="Last Viewed"
                value={formatEmailStatusDate(latestEngagementView?.created_at)}
                helper={latestEngagementView?.view_type || "No views yet"}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ViewerRoleStatusCard
                title="Client Viewed"
                viewed={clientEngagementViews.length > 0}
                firstView={firstClientView}
                latestView={latestClientView}
                totalViews={clientEngagementViews.length}
                totalReadTimeSeconds={clientReadingSeconds}
                viewerEmail={inspection.client_email}
                emptyText="Client has not opened the report or portal yet"
              />

              <ViewerRoleStatusCard
                title="Realtor Viewed"
                viewed={realtorEngagementViews.length > 0}
                firstView={firstRealtorView}
                latestView={latestRealtorView}
                totalViews={realtorEngagementViews.length}
                totalReadTimeSeconds={realtorReadingSeconds}
                viewerEmail={inspection.realtor_email || inspection.agent_email}
                emptyText="Realtor has not opened the report or portal yet"
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <EmailStatusCard
                title="Agreement Email"
                log={latestAgreementEmail}
                emptyText="Not sent yet"
              />

              <EmailStatusCard
                title="Report Email"
                log={latestReportEmail}
                emptyText="Not sent yet"
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ViewStatusCard
                title="Email Opens"
                log={latestEmailOpenView}
                logs={emailOpenViews}
                count={emailOpenViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Email Link Clicks"
                log={latestEmailClickView}
                logs={emailClickViews}
                count={emailClickViews.length}
                emptyText="No clicks yet"
              />

              <ViewStatusCard
                title="Reading Time"
                log={latestReportTimeEvent}
                logs={reportTimeEvents}
                count={reportTimeFinals.length}
                emptyText="No reading time yet"
              />

              <ViewStatusCard
                title="Agreement Opens"
                log={latestAgreementPageView}
                logs={agreementPageViews}
                count={agreementPageViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Reminder Agreement Views"
                log={latestAgreementReminderPageView}
                logs={agreementReminderPageViews}
                count={agreementReminderPageViews.length}
                emptyText="No reminder agreement views yet"
              />

              <ViewStatusCard
                title="Client Portal Opens"
                log={latestClientPortalView}
                logs={clientPortalViews}
                count={clientPortalViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Report Opens"
                log={latestReportShareView}
                logs={reportShareViews}
                count={reportShareViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Environmental Report Opens"
                log={latestEnvironmentalShareView}
                logs={environmentalShareViews}
                count={environmentalShareViews.length}
                emptyText="Not opened yet"
              />
            </div>

            {viewerActivitySummary.length > 0 && (
              <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                      Viewers Detected
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Every person detected across email opens, link clicks, portal opens, report opens, agreement views, and reading-time events.
                    </p>
                  </div>

                  <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-300">
                    {viewerActivitySummary.length} viewer{viewerActivitySummary.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {viewerActivitySummary.map((viewer: any) => (
                    <div
                      key={viewer.key}
                      className="rounded-xl border border-slate-700 bg-[#071224] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all text-sm font-black text-teal-300">
                            {viewer.email || viewer.label}
                          </p>

                          {viewer.role && (
                            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                              {viewer.role}
                            </p>
                          )}
                        </div>

                        <span className="shrink-0 rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-xs font-black text-teal-300">
                          {viewer.count}
                        </span>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-300">
                        <span className="font-bold text-white">Last activity:</span>{" "}
                        {formatEmailStatusDate(viewer.latestAt)}
                      </p>

                      {viewer.totalSeconds > 0 && (
                        <p className="mt-1 text-xs leading-5 text-purple-300">
                          <span className="font-bold text-white">Read time:</span>{" "}
                          {formatDuration(viewer.totalSeconds)}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.from(viewer.types.entries()).map(([type, count]: any) => (
                          <span
                            key={type}
                            className="rounded-full border border-slate-600 bg-black/30 px-2 py-1 text-[10px] font-black text-slate-300"
                          >
                            {formatViewType(type)}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AttentionPanel>


          </InspectorToolsDrawer>

          <section className="mb-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-4 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-purple-300">
                  Executive Summary
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  AI-generated client-friendly overview saved from this report.
                </p>
              </div>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-black ${
                  executiveSummary
                    ? "border-green-500/40 bg-green-500/10 text-green-300"
                    : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                }`}
              >
                {executiveSummary ? "Saved" : "Not Generated Yet"}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <GenerateSummaryButton inspectionId={String(inspection.id)} />

              {executiveSummary && (
                <DeleteSummaryButton inspectionId={String(inspection.id)} />
              )}
            </div>

            <div className="mt-4 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-4 text-sm leading-7 text-slate-100">
              {executiveSummary ||
                "Click Generate AI Summary to create and save the executive summary for this report."}
            </div>
          </section>

          <div className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-4">
            <h2 className="mb-4 text-2xl font-bold text-teal-300">
              Email Report
            </h2>

            <SendReportEmailButtons
              inspectionId={String(inspection.id)}
              clientEmail={inspection.client_email}
              realtorEmail={inspection.realtor_email || inspection.agent_email}
            />
          </div>

          <InspectionContactsManager
            inspectionId={String(inspection.id)}
            defaultClientName={inspection.client_name}
            defaultClientEmail={inspection.client_email}
            defaultRealtorName={inspection.realtor_name}
            defaultRealtorEmail={
              inspection.realtor_email || inspection.agent_email
            }
          />

          <div id="agreement-status" data-command-target="agreement-status">
          <AgreementSelector
            inspectionId={String(inspection.id)}
            initialAgreementState={inspection.agreement_state}
            initialAgreementTemplateId={inspection.agreement_template_id}
            initialAgreementTemplateIds={inspection.agreement_template_ids}
            propertyState={inspection.state}
          />

          <AgreementStatusPanel inspectionId={String(inspection.id)} />
          </div>

          <section className="mb-6 rounded-2xl border border-emerald-500/40 bg-[#071224] p-4 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-emerald-300">
                  Signed Agreements
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-400">
                  View, print, or save a PDF copy of each signed client/co-client agreement.
                </p>
              </div>

              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-300">
                {signedAgreements.length} Signed
              </span>
            </div>

            {signedAgreements.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-700 bg-[#020817]/80 p-4 text-sm leading-6 text-slate-400">
                No signed agreements saved yet. Once a client or co-client signs, their signed copy will appear here.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {signedAgreements.map((agreement: any) => (
                  <article
                    key={agreement.id}
                    className="rounded-xl border border-slate-700 bg-[#020817]/80 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-base font-black text-white">
                          {agreement.client_name || "Signed Client"}
                        </p>

                        <p className="mt-1 break-all text-sm text-slate-400">
                          {agreement.client_email || "No email saved"}
                        </p>

                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                          {agreement.signature_role || "client"} • Signed {formatEmailStatusDate(agreement.signed_at)}
                        </p>
                      </div>

                      <FastLinkButton
                        href={`/reports/${inspection.id}/signed-agreement/${agreement.id}`}
                        loadingText="Opening Signed Agreement..."
                        className="rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-center text-sm font-black text-emerald-300 hover:bg-emerald-500 hover:text-slate-950"
                      >
                        View / Save Copy
                      </FastLinkButton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div id="report-delivery-guard" data-command-target="report-delivery-guard">
          <ReportDeliveryGuard inspectionId={String(inspection.id)} />
          </div>

          <div id="payment-invoice" data-command-target="payment-invoice">
          <PaymentInvoicePanel inspection={inspection} />
          </div>

          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-700 bg-[#071224]">
            {propertyPhotoUpdated && (
              <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                Property photo updated.
              </div>
            )}

            {propertyPhotoError && (
              <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                {getPropertyPhotoErrorMessage(propertyPhotoError)}
              </div>
            )}

            {propertyPhoto ? (
              <img
                src={propertyPhoto}
                alt="Property"
                loading="lazy"
                decoding="async"
                className="h-56 w-full object-cover"
              />
            ) : (
              <div className="flex h-56 items-center justify-center bg-[#020817] px-4 text-center text-sm font-bold text-slate-400">
                No property photo saved yet.
              </div>
            )}

            <PropertyPhotoUploader
              inspectionId={String(inspection.id)}
              returnTo={`/reports/${inspection.id}`}
            />
          </section>

          <h1 className="break-words text-4xl font-extrabold text-teal-400 sm:text-5xl">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-200">
            Residential Home Inspection Report
          </p>

          <section className="mt-6 rounded-2xl border border-slate-700 bg-[#071224] p-4">
            <div className="mb-4">
              <h2 className="text-2xl font-extrabold text-teal-300">
                Defect Totals
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Quick count of true defects. Informational items are tracked
                separately and are not included in Total Defects.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DefectCountCard
                label="Total Defects"
                value={defectTotals.total}
                tone="text-white"
              />
              <DefectCountCard
                label="Safety / Major"
                value={defectTotals.safety}
                tone="text-red-300"
              />
              <DefectCountCard
                label="Recommended Repair"
                value={defectTotals.repair}
                tone="text-teal-300"
              />
              <DefectCountCard
                label="Maintenance / Monitor"
                value={defectTotals.maintenance}
                tone="text-yellow-300"
              />
              <DefectCountCard
                label="Informational"
                value={defectTotals.information}
                tone="text-blue-300"
              />
            </div>
          </section>

          {equipmentInventory.length > 0 && (
            <section
              id="equipment-inventory"
              className="mt-6 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-4"
            >
              <div className="mb-4">
                <h2 className="text-2xl font-extrabold text-cyan-300">
                  Equipment Inventory
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Major equipment documented during the inspection. These
                  inventory records are informational and are not counted as
                  defects unless a separate finding is created.
                </p>
              </div>

              <div className="grid gap-4">
                {equipmentInventory.map((item: any) => {
                  const equipmentImage =
                    item.signed_image_url ||
                    item.image_url ||
                    item.public_url ||
                    item.photo_url ||
                    item.signed_thumbnail_url ||
                    item.thumbnail_url ||
                    item.thumbnail_public_url ||
                    "";

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-700 bg-[#020817]/80 p-4"
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
                        {[item.manufacturer, item.model]
                          .filter(Boolean)
                          .join(" ") || "Equipment Record"}
                      </h3>

                      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                        <InventoryLine label="Serial" value={item.serial} />
                        <InventoryLine
                          label="Manufacture Year"
                          value={item.manufacture_year}
                        />
                        <InventoryLine
                          label="Estimated Age"
                          value={item.estimated_age}
                        />
                        <InventoryLine
                          label="Typical Industry Range"
                          value={getTypicalIndustryRange(item.expected_service_life)}
                        />
                        <InventoryLine
                          label="Service Life"
                          value="Industry estimate only"
                        />
                        <InventoryLine
                          label="Refrigerant"
                          value={item.refrigerant}
                        />
                        <InventoryLine
                          label="Condition"
                          value={getEquipmentConditionNote(item.condition)}
                        />
                      </div>

                      <EquipmentNoteBlock
                        label="Inspector Note"
                        value={getEquipmentLongNote(item, [
                          "inspector_note",
                          "inspection_note",
                          "note",
                          "notes",
                        ])}
                      />

                      <EquipmentNoteBlock
                        label="Maintenance Note"
                        value={getEquipmentLongNote(item, [
                          "maintenance_note",
                          "maintenance",
                          "service_note",
                        ])}
                      />

                      <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
Service-life information is a general industry estimate only. Actual service life can vary based on installation quality, maintenance history, operating conditions, environment, and usage. This should not be treated as a prediction or guarantee of remaining equipment life.
                      </p>

                      <details className="mt-4 rounded-xl border border-slate-700 bg-[#020817]/70 p-3">
                        <summary className="cursor-pointer select-none text-sm font-black text-cyan-300">
                          Edit Equipment Note
                        </summary>

                        <form action={updateEquipmentInventoryItem} className="mt-4 space-y-3">
                          <input type="hidden" name="inspection_id" value={inspection.id} />
                          <input type="hidden" name="equipment_id" value={item.id} />

                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
                              Condition
                            </label>
                            <input
                              name="condition"
                              defaultValue={getEquipmentConditionLabel(item.condition)}
                              placeholder="No specific deficiency noted"
                              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
                              Inspector Note
                            </label>
                            <textarea
                              name="inspector_note"
                              defaultValue={getEquipmentInspectorNote(item)}
                              placeholder="Example: Data plate documented. Unit operated normally at time of inspection."
                              rows={3}
                              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
                              Maintenance Note
                            </label>
                            <textarea
                              name="maintenance_note"
                              defaultValue={getEquipmentMaintenanceNote(item)}
                              placeholder="Example: Recommend routine HVAC servicing and filter maintenance."
                              rows={3}
                              className="w-full rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-400"
                          >
                            Save Equipment Note
                          </button>
                        </form>
                      </details>

                      <form action={deleteEquipmentInventoryItem} className="mt-4">
                        <input type="hidden" name="inspection_id" value={inspection.id} />
                        <input type="hidden" name="equipment_id" value={item.id} />
                        <button
                          type="submit"
                          className="w-full rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 transition hover:bg-red-500/20"
                        >
                          Delete Equipment
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <form
            action={updateInspectionDetails}
            className="mt-8 border-t border-slate-700 pt-6"
          >
            <input type="hidden" name="inspection_id" value={inspection.id} />

            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-teal-400">
                Inspection Details
              </h2>

              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
              >
                Save Inspection Details
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Inspection Information
                </h3>

                <EditItem
                  label="Property Address"
                  name="address"
                  value={inspection.address}
                />
                <EditItem
                  label="Client Name"
                  name="client_name"
                  value={inspection.client_name}
                />
                <EditItem
                  label="Client Email"
                  name="client_email"
                  value={inspection.client_email}
                />
                <EditItem
                  label="Realtor"
                  name="realtor_name"
                  value={inspection.realtor_name}
                />
                <EditItem
                  label="Inspection Date"
                  name="inspection_date"
                  value={inspection.inspection_date}
                  type="date"
                />
              </div>

              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Property / Site Information
                </h3>

                <EditItem
                  label="Square Feet"
                  name="square_feet"
                  value={inspection.square_feet}
                />
                <EditItem
                  label="Year Built"
                  name="year_built"
                  value={inspection.year_built}
                />

                <div className="grid grid-cols-3 gap-3">
                  <EditItem label="City" name="city" value={inspection.city} />
                  <EditItem
                    label="State"
                    name="state"
                    value={inspection.state}
                  />
                  <EditItem label="Zip" name="zip" value={inspection.zip} />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div id="report-findings" data-command-target="report-findings" className="w-full max-w-none overflow-visible">
          <ReportFindingsSortable groupedFindings={groupedFindingsArray} />
        </div>
      </div>
    </main>
  );
}

function EngagementStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-white">{value}</p>

      {helper && (
        <p className="mt-2 text-xs leading-5 text-slate-400">{helper}</p>
      )}
    </div>
  );
}

function ViewerRoleStatusCard({
  title,
  viewed,
  firstView,
  latestView,
  totalViews,
  totalReadTimeSeconds,
  viewerEmail,
  emptyText,
}: {
  title: string;
  viewed: boolean;
  firstView: any;
  latestView: any;
  totalViews: number;
  totalReadTimeSeconds: number;
  viewerEmail?: string | null;
  emptyText: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        viewed
          ? "border-green-500/40 bg-green-500/10"
          : "border-yellow-500/40 bg-yellow-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-slate-300">
            {title}
          </p>

          <p
            className={`mt-2 text-2xl font-black ${
              viewed ? "text-green-300" : "text-yellow-300"
            }`}
          >
            {viewed ? "Yes" : "No"}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${
            viewed
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
          }`}
        >
          {totalViews} view{totalViews === 1 ? "" : "s"}
        </span>
      </div>

      {!viewed ? (
        <p className="mt-3 text-sm leading-5 text-slate-300">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          {viewerEmail && (
            <p>
              <span className="font-bold text-white">Expected Viewer:</span>{" "}
              <span className="break-all">{viewerEmail}</span>
            </p>
          )}

          <p>
            <span className="font-bold text-white">First Viewed:</span>{" "}
            {formatEmailStatusDate(firstView?.created_at)}
          </p>

          <p>
            <span className="font-bold text-white">Last Viewed:</span>{" "}
            {formatEmailStatusDate(latestView?.created_at)}
          </p>

          <p>
            <span className="font-bold text-white">Read Time:</span>{" "}
            {formatDuration(totalReadTimeSeconds)}
          </p>
        </div>
      )}
    </div>
  );
}

function EmailStatusCard({
  title,
  log,
  emptyText,
}: {
  title: string;
  log: any;
  emptyText: string;
}) {
  const sentAt = log?.sent_at || log?.created_at;
  const deliveredAt = log?.delivered_at;
  const openedAt = log?.opened_at;
  const clickedAt = log?.clicked_at;
  const failedAt = log?.failed_at || log?.bounced_at;

  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-sm font-black uppercase tracking-wide text-slate-400">
        {title}
      </p>

      {!log ? (
        <p className="mt-2 text-lg font-bold text-yellow-300">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          <p>
            <span className="font-bold text-white">Status:</span>{" "}
            {log.status || "sent"}
          </p>
          <p>
            <span className="font-bold text-white">Recipient:</span>{" "}
            {log.recipient_email || log.recipient || "N/A"}
          </p>
          <p>
            <span className="font-bold text-white">Sent:</span>{" "}
            {formatEmailStatusDate(sentAt)}
          </p>
          {deliveredAt && (
            <p className="text-green-300">
              Delivered: {formatEmailStatusDate(deliveredAt)}
            </p>
          )}
          {openedAt && (
            <p className="text-blue-300">
              Opened: {formatEmailStatusDate(openedAt)}
            </p>
          )}
          {clickedAt && (
            <p className="text-teal-300">
              Link Clicked: {formatEmailStatusDate(clickedAt)}
            </p>
          )}
          {failedAt && (
            <p className="text-red-300">
              Failed/Bounced: {formatEmailStatusDate(failedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ViewStatusCard({
  title,
  log,
  logs = [],
  count = 0,
  emptyText,
}: {
  title: string;
  log: any;
  logs?: any[];
  count?: number;
  emptyText: string;
}) {
  const viewers = getViewerActivityItems(logs || (log ? [log] : []));

  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black uppercase tracking-wide text-slate-400">
          {title}
        </p>

        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-xs font-black text-teal-300">
          {count}
        </span>
      </div>

      {!log ? (
        <p className="mt-2 text-lg font-bold text-yellow-300">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          <p className="text-green-300">
            Opened: {formatEmailStatusDate(log.created_at)}
          </p>

          {getDurationSeconds(log) > 0 && (
            <p className="text-purple-300">
              Time: {formatDuration(getDurationSeconds(log))}
            </p>
          )}

          {log.viewer_email && (
            <p>
              <span className="font-bold text-white">Viewer:</span>{" "}
              {log.viewer_email}
            </p>
          )}

          {log.viewer_role && (
            <p>
              <span className="font-bold text-white">Role:</span>{" "}
              {log.viewer_role}
            </p>
          )}

          {viewers.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                People detected
              </p>

              <div className="mt-2 space-y-2">
                {viewers.map((viewer: any) => (
                  <div
                    key={viewer.key}
                    className="rounded-lg border border-slate-700 bg-black/20 px-2 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all text-xs font-black text-teal-300">
                          {viewer.email || viewer.label}
                        </p>
                        {viewer.role && (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {viewer.role}
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-[10px] font-black text-teal-300">
                        {viewer.count}
                      </span>
                    </div>

                    <p className="mt-1 text-[10px] text-slate-400">
                      Last: {formatEmailStatusDate(viewer.latestAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DefectCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
    </div>
  );
}


function getEquipmentConditionLabel(value: any) {
  const clean = String(value || "").trim();

  if (!isKnownEquipmentValue(clean)) return "";

  const lower = clean.toLowerCase();

  if (
    lower.includes("typical service life remaining") ||
    lower.includes("service life remaining") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  return clean;
}






function getEquipmentLongNote(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    const clean = String(value || "").trim();
    const lower = clean.toLowerCase();

    if (
      clean &&
      lower !== "unknown" &&
      lower !== "n/a" &&
      lower !== "na" &&
      lower !== "not visible" &&
      lower !== "unreadable" &&
      lower !== "unable to determine"
    ) {
      return clean;
    }
  }

  return "";
}

function EquipmentNoteBlock({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (
    !clean ||
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "not visible" ||
    lower === "unreadable" ||
    lower === "unable to determine"
  ) {
    return null;
  }

  return (
    <div className="mt-4 w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
        {clean}
      </p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-800 pb-1">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function EditItem({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: any;
  type?: string;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-bold text-slate-400">
        {label}
      </label>

      <input
        type={type}
        name={name}
        defaultValue={value || ""}
        placeholder="Not entered"
        className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
      />
    </div>
  );
}
