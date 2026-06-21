import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

import PrintButton from "../../../components/PrintButton";
import ReportFindingsSortable from "./ReportFindingsSortable";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
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

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(url.substring(index + marker.length));
}

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
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);

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

function formatEmailStatusDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function getViewerSummary(logs: any[]) {
  const viewers: string[] = [];
  const seen = new Set<string>();

  (logs || []).forEach((log: any) => {
    const viewerEmail = String(log.viewer_email || "").trim();
    const viewerRole = String(log.viewer_role || "").trim();

    const label = viewerEmail || viewerRole || "Unknown viewer";
    const key = label.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      viewers.push(label);
    }
  });

  return viewers;
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

export default async function ReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  async function updateInspectionDetails(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");

    await supabase
      .from("inspections")
      .update({
        address: String(formData.get("address") || ""),
        client_name: String(formData.get("client_name") || ""),
        client_email: String(formData.get("client_email") || ""),
        realtor_name: String(formData.get("realtor_name") || ""),
        inspection_date: String(formData.get("inspection_date") || ""),
        square_feet: String(formData.get("square_feet") || ""),
        year_built: String(formData.get("year_built") || ""),
        city: String(formData.get("city") || ""),
        state: String(formData.get("state") || ""),
        zip: String(formData.get("zip") || ""),
      })
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    revalidatePath(`/reports/${inspectionId}`);
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

  const executiveSummary = String(inspection.executive_summary || "").trim();

  const [emailLogsResult, viewLogsResult, equipmentResult, findingsResult] =
    await Promise.all([
      supabase
        .from("email_logs")
        .select("*")
        .eq("inspection_id_bigint", Number(inspection.id))
        .order("created_at", { ascending: false }),
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

  const latestAgreementEmail = getLatestEmailLog(emailLogs, "agreement_email");
  const latestReportEmail =
    getLatestEmailLog(emailLogs, "inspection_report") ||
    getLatestEmailLog(emailLogs, "environmental_report");

  const agreementPageViews = getViewLogsByType(viewLogs, "agreement_page");
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
    ...clientPortalViews,
    ...reportShareViews,
    ...environmentalShareViews,
  ];

  const firstEngagementView = getFirstViewLog(engagementViews);
  const latestEngagementView = engagementViews[0] || null;
  const uniqueViewerCount = getUniqueViewerCount(engagementViews);
  const viewerSummary = getViewerSummary(engagementViews);

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

  // Performance note:
  // The internal report edit page must stay fast with large reports.
  // Do NOT create signed Supabase URLs for every photo during initial page render.
  // New uploads already save public_url + thumbnail_url, so use those immediately.
  // Full-size signed URLs are still available through the storage path when needed elsewhere
  // such as print/share flows, but this edit page should not block on signing hundreds of images.

  const equipmentInventory = equipmentInventoryRaw.map((item: any) => ({
    ...item,
    signed_image_url:
      item.signed_image_url ||
      item.thumbnail_url ||
      item.image_url ||
      item.public_url ||
      "",
  }));

  const photosWithUrls = (photosRaw || []).map((photo: any) => ({
    ...photo,
    signed_url: getPhotoFallbackUrl(photo),
    signed_thumbnail_url:
      photo.signed_thumbnail_url ||
      photo.thumbnail_url ||
      photo.thumbnail_public_url ||
      photo.thumbnail ||
      "",
  }));

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
    const signedImageUrl =
      finding.signed_image_url ||
      finding.public_image_url ||
      finding.image_url ||
      "";

    return {
      ...finding,
      section: normalizeSection(finding.section),
      signed_image_url: signedImageUrl || null,
      image_url: signedImageUrl || finding.image_url || null,
      photos: photosByFindingId[finding.id] || [],
    };
  });

  const groupedFindingsArray = SECTION_ORDER.map((section) => ({
    section,
    findings: findings.filter((finding: any) => finding.section === section),
  }));

  const defectFindings = findings.filter((finding: any) => {
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

  const propertyPhoto =
    inspection.property_image ||
    inspection.street_view_url ||
    inspection.cover_photo_url ||
    inspection.google_photo_url ||
    inspection.property_photo_url ||
    inspection.place_photo_url ||
    inspection.photo_url ||
    inspection.image_url ||
    "";

  const reportIsPublished =
    inspection.published === true ||
    String(inspection.report_status || "").toLowerCase() === "published";

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

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto w-full max-w-none px-3 py-4 sm:px-4 md:px-6 lg:max-w-7xl lg:py-8">
        <div className="mb-6 overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] p-3 shadow-xl sm:p-5 md:p-6">
          <div className="mb-6 flex max-w-full flex-wrap gap-3 overflow-hidden">
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

            <form action={publishReport}>
              <input type="hidden" name="inspection_id" value={inspection.id} />
              <button
                type="submit"
                className={`rounded-xl px-5 py-3 font-bold ${
                  reportIsPublished
                    ? "bg-green-700 text-white hover:bg-green-600"
                    : "bg-green-500 text-slate-950 hover:bg-green-400"
                }`}
              >
                {reportIsPublished ? "Report Published" : "Publish Report"}
              </button>
            </form>

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

          <div className="mb-8 rounded-2xl border border-yellow-500 bg-yellow-950/30 p-5 text-yellow-200">
            <h2 className="text-2xl font-black">Report Tools</h2>
            <p className="mt-2">
              All report tools are enabled, including Send Report, Realtor
              Summary, email, agreements, Copy Share Link, Favorite Findings
              Library, Insert Favorite Finding, One-Tap AI, Field Tool, Full AI
              Capture, Equipment Analyzer, repair requests, and findings.
            </p>
          </div>

          <section className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
            <h2 className="text-2xl font-bold text-teal-300">
              Report Engagement
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Email delivery comes from Resend. Page-open tracking is recorded
              directly by On Point Inspect when the client/realtor opens the
              portal, agreement, shared report, or environmental report.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <EngagementStatCard
                label="Total Views"
                value={String(engagementViews.length)}
                helper="All tracked report, portal, agreement, and environmental opens"
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
                count={emailOpenViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Email Link Clicks"
                log={latestEmailClickView}
                count={emailClickViews.length}
                emptyText="No clicks yet"
              />

              <ViewStatusCard
                title="Reading Time"
                log={latestReportTimeEvent}
                count={reportTimeFinals.length}
                emptyText="No reading time yet"
              />

              <ViewStatusCard
                title="Agreement Opens"
                log={latestAgreementPageView}
                count={agreementPageViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Client Portal Opens"
                log={latestClientPortalView}
                count={clientPortalViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Report Opens"
                log={latestReportShareView}
                count={reportShareViews.length}
                emptyText="Not opened yet"
              />

              <ViewStatusCard
                title="Environmental Report Opens"
                log={latestEnvironmentalShareView}
                count={environmentalShareViews.length}
                emptyText="Not opened yet"
              />
            </div>

            {viewerSummary.length > 0 && (
              <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                  Viewers Detected
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {viewerSummary.map((viewer) => (
                    <span
                      key={viewer}
                      className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-300"
                    >
                      {viewer}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="mb-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-5 shadow-xl">
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

            <div className="mt-4 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-sm leading-7 text-slate-100">
              {executiveSummary ||
                "Click Generate AI Summary to create and save the executive summary for this report."}
            </div>
          </section>

          <div className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
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

          <AgreementSelector
            inspectionId={String(inspection.id)}
            initialAgreementState={inspection.agreement_state}
            initialAgreementTemplateId={inspection.agreement_template_id}
            initialAgreementTemplateIds={inspection.agreement_template_ids}
            propertyState={inspection.state}
          />

          <AgreementStatusPanel inspectionId={String(inspection.id)} />

          <ReportDeliveryGuard inspectionId={String(inspection.id)} />

          <PaymentInvoicePanel inspection={inspection} />

          {propertyPhoto && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-slate-700 bg-black">
              <img
                src={propertyPhoto}
                alt="Property"
                loading="lazy"
                decoding="async"
                className="h-56 w-full object-cover"
              />
            </div>
          )}

          <h1 className="text-5xl font-extrabold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-200">
            Residential Home Inspection Report
          </p>

          <section className="mt-6 rounded-2xl border border-slate-700 bg-[#071224] p-5">
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
              className="mt-6 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-5"
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
            className="mt-8 border-t border-slate-700 pt-8"
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
                  label="Client"
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

        <ReportFindingsSortable groupedFindings={groupedFindingsArray} />
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
  count = 0,
  emptyText,
}: {
  title: string;
  log: any;
  count?: number;
  emptyText: string;
}) {
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
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-slate-800 pb-1">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-200">{value}</span>
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
