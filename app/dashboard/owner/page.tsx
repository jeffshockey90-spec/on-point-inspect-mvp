
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import FastLinkButton from "../../../components/FastLinkButton";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import PushNotificationSetup from "../../../components/PushNotificationSetup";
import DeleteDemoReportButton from "../../../components/DeleteDemoReportButton";
import SupportUnreadBadge from "../../../components/SupportUnreadBadge";
import AIBudgetStatus from "../../../components/AIBudgetStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

type UserManagementRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
  isActive: boolean;
  deletionRequestedAt: string | null;
  deletedAt: string | null;
  reports: number;
  revenue: number;
  lastActivity: string | null;
  source: string;
};

async function createUserClient() {
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

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);
  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;
  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function getInspectionPrice(inspection: any) {
  return (
    getNumber(inspection?.price) ||
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    calculatePriceFromSqft(inspection?.square_feet || inspection?.sqft) ||
    0
  );
}

function getPaidAmount(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);
  const balance = Math.max(0, price - paid);

  if (price > 0 && paid >= price) return true;
  if (paid > 0 && balance <= 0) return true;

  return false;
}

function isThisMonth(value: any, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isAfter(value: any, compareDate: Date) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= compareDate;
}

function money(value: any) {
  const amount = getNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMonthKey(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";

  return formatAppValue(date, {
    month: "short",
    year: "numeric",
  });
}

function getViewType(event: any) {
  return String(event?.view_type || event?.event_type || "").toLowerCase();
}

function getUserEmail(row: any) {
  return row?.email || row?.user_email || row?.owner_email || row?.auth_email || "";
}

function getUserName(row: any) {
  return (
    row?.full_name ||
    row?.display_name ||
    row?.business_name ||
    row?.company_name ||
    row?.name ||
    getUserEmail(row) ||
    "Unknown User"
  );
}

function getUserRole(row: any) {
  return String(row?.role || row?.account_type || row?.user_role || "").toLowerCase();
}

function getInspectorId(inspection: any) {
  return String(inspection?.inspector_id || inspection?.user_id || "");
}

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function getUserKey(row: any) {
  return String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || getUserEmail(row) || "");
}

function getInspectionRevenue(inspection: any) {
  if (!isPaymentComplete(inspection)) return 0;
  return getPaidAmount(inspection) || getInspectionPrice(inspection);
}

function getUserStatusLabel(row: UserManagementRow) {
  if (row.deletedAt) return "Deleted";
  if (row.deletionRequestedAt) return "Deletion Requested";
  if (!row.isActive) return "Inactive";
  return "Active";
}

function getUserStatusClass(row: UserManagementRow) {
  if (row.deletedAt) return "border-red-500/40 bg-red-500/10 text-red-300";
  if (row.deletionRequestedAt) return "border-orange-500/40 bg-orange-500/10 text-orange-300";
  if (!row.isActive) return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
  return "border-green-500/40 bg-green-500/10 text-green-300";
}

async function safeSelect<T = any>(query: PromiseLike<{ data: T | null; error: any }>, label: string) {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`Owner dashboard ${label} error:`, error);
      return [] as any[];
    }
    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner dashboard ${label} exception:`, error);
    return [] as any[];
  }
}

function buildUserManagementRows({
  profiles,
  inspectorProfiles,
  companyUsers,
  inspections,
  events,
  deviceEvents,
}: {
  profiles: any[];
  inspectorProfiles: any[];
  companyUsers: any[];
  inspections: any[];
  events: any[];
  deviceEvents: any[];
}) {
  const rows = new Map<string, UserManagementRow>();

  function upsertUser(row: any, source: string) {
    const key = getUserKey(row);
    if (!key) return;

    const current = rows.get(key);
    const email = getUserEmail(row) || current?.email || "";
    const role = getUserRole(row) || current?.role || (source === "inspector_profiles" ? "inspector" : "user");

    rows.set(key, {
      id: key,
      name: getUserName(row) || current?.name || "Unknown User",
      email,
      role,
      createdAt: row?.created_at || current?.createdAt || null,
      isActive: row?.is_active === false ? false : current?.isActive ?? true,
      deletionRequestedAt: row?.deletion_requested_at || current?.deletionRequestedAt || null,
      deletedAt: row?.deleted_at || current?.deletedAt || null,
      reports: current?.reports || 0,
      revenue: current?.revenue || 0,
      lastActivity: current?.lastActivity || null,
      source: current?.source ? `${current.source}, ${source}` : source,
    });
  }

  profiles.forEach((row: any) => upsertUser(row, "profiles"));
  companyUsers.forEach((row: any) => upsertUser(row, "company_users"));
  inspectorProfiles.forEach((row: any) => upsertUser({ ...row, id: row.inspector_id || row.id, role: "inspector" }, "inspector_profiles"));

  inspections.forEach((inspection: any) => {
    const inspectorId = getInspectorId(inspection);
    if (!inspectorId) return;

    if (!rows.has(inspectorId)) {
      rows.set(inspectorId, {
        id: inspectorId,
        name: "Inspector",
        email: "",
        role: "inspector",
        createdAt: null,
        isActive: true,
        deletionRequestedAt: null,
        deletedAt: null,
        reports: 0,
        revenue: 0,
        lastActivity: null,
        source: "inspections",
      });
    }

    const current = rows.get(inspectorId)!;
    const inspectionDate = inspection?.created_at || inspection?.inspection_date || null;

    current.reports += 1;
    current.revenue += getInspectionRevenue(inspection);

    if (inspectionDate) {
      const currentTime = current.lastActivity ? new Date(current.lastActivity).getTime() : 0;
      const nextTime = new Date(inspectionDate).getTime();
      if (!Number.isNaN(nextTime) && nextTime > currentTime) {
        current.lastActivity = inspectionDate;
      }
    }
  });

  [...events, ...deviceEvents].forEach((event: any) => {
    const email = String(event?.viewer_email || event?.user_email || "").toLowerCase();
    if (!email) return;

    const matching = [...rows.values()].find((row) => row.email.toLowerCase() === email);
    if (!matching) return;

    const eventDate = event?.created_at || null;
    if (!eventDate) return;

    const currentTime = matching.lastActivity ? new Date(matching.lastActivity).getTime() : 0;
    const nextTime = new Date(eventDate).getTime();
    if (!Number.isNaN(nextTime) && nextTime > currentTime) {
      matching.lastActivity = eventDate;
    }
  });

  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.reports - a.reports);
}

export default async function OwnerDashboardPage() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = String(user.email || "").toLowerCase();
  if (!OWNER_EMAILS.includes(userEmail)) {
    return (
      <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-red-300">Owner Only</p>
          <h1 className="mt-4 text-4xl font-black">Access Restricted</h1>
          <p className="mt-4 text-slate-300">This dashboard is only available to the FLOW owner account.</p>
          <FastLinkButton href="/dashboard" className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-black text-red-300 hover:bg-red-500/10">
            Back to Dashboard
          </FastLinkButton>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

  const [profiles, inspectorProfiles, companyUsers, inspections, events, pushSubscriptions, nativePushTokens, deviceEvents, findings, photos, agreements, invoices, templates, inspectionContacts] = await Promise.all([
    safeSelect(admin.from("profiles").select("*"), "profiles"),
    safeSelect(admin.from("inspector_profiles").select("*"), "inspector_profiles"),
    safeSelect(admin.from("company_users").select("*"), "company_users"),
    safeSelect(admin.from("inspections").select("*"), "inspections"),
    safeSelect(admin.from("inspection_view_events").select("*").order("created_at", { ascending: false }).limit(500), "inspection_view_events"),
    safeSelect(admin.from("app_push_subscriptions").select("*").order("created_at", { ascending: false }), "app_push_subscriptions"),
    safeSelect(admin.from("app_native_push_tokens").select("*").order("updated_at", { ascending: false }), "app_native_push_tokens"),
    safeSelect(admin.from("app_device_events").select("*").order("created_at", { ascending: false }).limit(2000), "app_device_events"),
    safeSelect(admin.from("findings").select("*"), "findings"),
    safeSelect(admin.from("photos").select("*"), "photos"),
    safeSelect(admin.from("inspection_agreements").select("*"), "inspection_agreements"),
    Promise.resolve([]),
    safeSelect(admin.from("finding_templates").select("*"), "finding_templates"),
    safeSelect(admin.from("inspection_contacts").select("inspection_id,role,email,portal_access"), "inspection_contacts"),
  ]);

  function roleLooksLikeRealtorPreview(value: unknown) {
    const role = String(value || "").trim().toLowerCase();
    return role.includes("realtor") || role.includes("agent") || role.includes("transaction") || role.includes("coordinator");
  }

  function roleLooksLikeClientPreview(value: unknown) {
    const role = String(value || "").trim().toLowerCase();
    return role === "client" || role.includes("buyer") || role.includes("co-client") || role.includes("coclient") || role.includes("homeowner");
  }

  const inspectionById = new Map(inspections.map((row: any) => [String(row.id), row]));

  const realtorReportCounts = new Map<string, number>();
  (inspectionContacts || []).forEach((contact: any) => {
    if (contact?.portal_access === false) return;
    if (!roleLooksLikeRealtorPreview(contact?.role)) return;
    const email = String(contact?.email || "").trim().toLowerCase();
    if (!email) return;
    realtorReportCounts.set(email, (realtorReportCounts.get(email) || 0) + 1);
  });

  const previewRealtors = Array.from(realtorReportCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([email, count]) => ({ email, count }));

  const clientPreviewIds = new Set<string>();
  (inspectionContacts || []).forEach((contact: any) => {
    if (contact?.portal_access === false) return;
    if (!roleLooksLikeClientPreview(contact?.role)) return;
    const id = String(contact?.inspection_id || "").trim();
    if (id) clientPreviewIds.add(id);
  });

  const previewClientReports = Array.from(clientPreviewIds)
    .map((id) => inspectionById.get(id))
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
    .slice(0, 6)
    .map((row: any) => ({
      id: String(row.id),
      address: row.property_address || row.address || "Untitled Inspection",
    }));

  const allUserRows = profiles.length > 0 ? profiles : companyUsers;
  const totalUsers = allUserRows.length;
  const inspectorIds = new Set<string>();

  [...profiles, ...inspectorProfiles, ...companyUsers].forEach((row: any) => {
    const role = getUserRole(row);
    const id = String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || "");

    if (role.includes("inspector") || row?.is_inspector === true || row?.inspector === true || row?.inspector_id) {
      if (id) inspectorIds.add(id);
    }
  });

  inspections.forEach((inspection: any) => {
    const id = getInspectorId(inspection);
    if (id) inspectorIds.add(id);
  });

  const demoReports = inspections
    .filter((inspection: any) => inspection?.is_demo === true)
    .sort(
      (a: any, b: any) =>
        new Date(b?.demo_created_at || b?.created_at || 0).getTime() -
        new Date(a?.demo_created_at || a?.created_at || 0).getTime()
    );

  const liveInspections = inspections.filter(
    (inspection: any) => inspection?.is_demo !== true
  );

  const activeInspectorIds = new Set(
    inspections
      .filter((inspection: any) => isAfter(inspection?.created_at || inspection?.inspection_date, thirtyDaysAgo))
      .map(getInspectorId)
      .filter(Boolean)
  );

  const reportsCreated = liveInspections.length;
  const reportsThisMonth = liveInspections.filter((inspection: any) =>
    isThisMonth(getInspectionDate(inspection), now)
  ).length;

  const paidInspections = liveInspections.filter(isPaymentComplete);
  const revenue = paidInspections.reduce((sum: number, inspection: any) => {
    return sum + (getPaidAmount(inspection) || getInspectionPrice(inspection));
  }, 0);

  const revenueThisMonth = liveInspections
    .filter((inspection: any) => isThisMonth(getInspectionDate(inspection), now) && isPaymentComplete(inspection))
    .reduce((sum: number, inspection: any) => sum + (getPaidAmount(inspection) || getInspectionPrice(inspection)), 0);

  const newSignups = allUserRows
    .filter((row: any) => isAfter(row?.created_at || row?.inserted_at, thirtyDaysAgo))
    .sort((a: any, b: any) => new Date(b?.created_at || b?.inserted_at || 0).getTime() - new Date(a?.created_at || a?.inserted_at || 0).getTime());

  const monthMap: Record<string, { users: number; reports: number; revenue: number }> = {};

  allUserRows.forEach((row: any) => {
    const key = getMonthKey(row?.created_at || row?.inserted_at);
    if (key === "No Date") return;
    if (!monthMap[key]) monthMap[key] = { users: 0, reports: 0, revenue: 0 };
    monthMap[key].users += 1;
  });

  inspections.forEach((inspection: any) => {
    const key = getMonthKey(getInspectionDate(inspection));
    if (key === "No Date") return;
    if (!monthMap[key]) monthMap[key] = { users: 0, reports: 0, revenue: 0 };
    monthMap[key].reports += 1;
    if (isPaymentComplete(inspection)) {
      monthMap[key].revenue += getPaidAmount(inspection) || getInspectionPrice(inspection);
    }
  });

  const growthRows = Object.entries(monthMap)
    .map(([month, values]) => ({ month, ...values }))
    .slice(-6);

  const maxReports = Math.max(1, ...growthRows.map((row) => row.reports));
  const maxRevenue = Math.max(1, ...growthRows.map((row) => row.revenue));
  const maxUsers = Math.max(1, ...growthRows.map((row) => row.users));

  const reportViewedEvents = events.filter((event: any) =>
    ["client_portal", "report_share", "environmental_share"].includes(getViewType(event))
  );
  const agreementSignedEvents = events.filter((event: any) => getViewType(event) === "agreement_signed");
  const paymentReceivedEvents = events.filter((event: any) => getViewType(event) === "payment_received");
  const reviewEvents = events.filter((event: any) => getViewType(event).includes("review"));

  const activeDevices = new Set(
    deviceEvents
      .filter((event: any) => isAfter(event?.created_at, thirtyDaysAgo))
      .map((event: any) => event?.device_id || event?.user_agent || event?.id)
      .filter(Boolean)
  );

  const downloads = deviceEvents.filter((event: any) =>
    ["install", "app_install", "pwa_install", "first_open"].includes(String(event?.event_type || "").toLowerCase())
  ).length;

  const firstOpenDevices = new Set(
    deviceEvents
      .filter((event: any) => ["first_open", "install", "app_install", "pwa_install"].includes(String(event?.event_type || "").toLowerCase()))
      .map((event: any) => event?.device_id || event?.user_agent)
      .filter(Boolean)
  );

  const retainedDevices = new Set(
    deviceEvents
      .filter((event: any) => isAfter(event?.created_at, sevenDaysAgo))
      .map((event: any) => event?.device_id || event?.user_agent)
      .filter((id: string) => id && firstOpenDevices.has(id))
  );

  const retentionRate = firstOpenDevices.size > 0 ? Math.round((retainedDevices.size / firstOpenDevices.size) * 100) : 0;

  const userManagementRows = buildUserManagementRows({
    profiles,
    inspectorProfiles,
    companyUsers,
    inspections,
    events,
    deviceEvents,
  });

  const inactiveUsers = userManagementRows.filter((row) => !row.isActive || row.deletedAt || row.deletionRequestedAt).length;
  const topInspector = userManagementRows.find((row) => row.reports > 0);
  const recentEvents = events.slice(0, 12);
  const recentUsers = newSignups.slice(0, 10);

  const liveInspectionIds = new Set(liveInspections.map((inspection: any) => String(inspection.id)));

  const liveFindings = findings.filter((finding: any) =>
    liveInspectionIds.has(String(finding.inspection_id || finding.report_id || ""))
  );

  const livePhotos = photos.filter((photo: any) =>
    liveInspectionIds.has(String(photo.inspection_id || photo.report_id || ""))
  );

  const signedAgreementRows = agreements.filter((agreement: any) => {
    const status = String(agreement?.status || agreement?.agreement_status || "").toLowerCase();
    return Boolean(agreement?.signed_at) || status.includes("signed");
  });

  const invoicesPaid = invoices.filter((invoice: any) => {
    const status = String(invoice?.status || invoice?.invoice_status || invoice?.payment_status || "").toLowerCase();
    return status === "paid" || Boolean(invoice?.paid_at);
  });

  const nativePushEnabled = nativePushTokens.filter((row: any) => row?.enabled !== false);
  const webPushEnabled = pushSubscriptions.filter((row: any) => row?.enabled !== false);
  const totalPushDevices = nativePushEnabled.length + webPushEnabled.length;

  const newDevices7 = new Set(
    deviceEvents
      .filter((event: any) => isAfter(event?.created_at, sevenDaysAgo))
      .map((event: any) => event?.device_id || event?.user_agent || event?.id)
      .filter(Boolean)
  );

  const newDevices30 = new Set(
    deviceEvents
      .filter((event: any) => isAfter(event?.created_at, thirtyDaysAgo))
      .map((event: any) => event?.device_id || event?.user_agent || event?.id)
      .filter(Boolean)
  );

  const iosDeviceEvents = deviceEvents.filter((event: any) => {
    const platform = String(event?.platform || "").toLowerCase();
    const ua = String(event?.user_agent || "").toLowerCase();
    return platform.includes("ios") || platform.includes("iphone") || ua.includes("iphone") || ua.includes("ipad");
  });

  const webDeviceEvents = deviceEvents.filter((event: any) => {
    const platform = String(event?.platform || "").toLowerCase();
    const ua = String(event?.user_agent || "").toLowerCase();
    return !platform.includes("ios") && !platform.includes("iphone") && !ua.includes("iphone") && !ua.includes("ipad");
  });

  const appVersionCounts = new Map<string, number>();
  deviceEvents.forEach((event: any) => {
    const version =
      event?.metadata?.app_version ||
      event?.metadata?.appVersion ||
      "Unknown";
    appVersionCounts.set(String(version), (appVersionCounts.get(String(version)) || 0) + 1);
  });

  const appVersionRows = [...appVersionCounts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const sectionCounts = new Map<string, number>();
  liveFindings.forEach((finding: any) => {
    const section = String(finding?.section || "Uncategorized");
    sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
  });

  const topSectionRows = [...sectionCounts.entries()]
    .map(([section, count]) => ({ section, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const severityCounts = new Map<string, number>();
  liveFindings.forEach((finding: any) => {
    const severity = String(finding?.severity || "Uncategorized");
    severityCounts.set(severity, (severityCounts.get(severity) || 0) + 1);
  });

  const severityRows = [...severityCounts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const templateUsageRows = templates
    .map((template: any) => ({
      title: template?.title || "Untitled Template",
      section: template?.section || "N/A",
      count: getNumber(template?.usage_count || template?.used_count || template?.insert_count),
    }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 8);

  const averageInspectionPrice =
    paidInspections.length > 0 ? Math.round(revenue / paidInspections.length) : 0;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">Owner Dashboard</p>
              <h1 className="mt-4 text-5xl font-black text-white">FLOW Growth Center</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                System-wide owner metrics for users, inspectors, reports, revenue, app growth, push notifications, and client engagement.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <FastLinkButton
                href="/dashboard/owner/users"
                className="rounded-xl border border-cyan-500 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-500/10"
              >
                👥 User Management
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/companies"
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                🏢 Companies
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/devices"
                className="rounded-xl border border-purple-500 px-5 py-3 font-black text-purple-300 transition hover:bg-purple-500/10"
              >
                📱 Device Analytics
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/revenue"
                className="rounded-xl border border-green-500 px-5 py-3 font-black text-green-300 transition hover:bg-green-500/10"
              >
                💰 Revenue Dashboard
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/push"
                className="rounded-xl border border-yellow-500 px-5 py-3 font-black text-yellow-300 transition hover:bg-yellow-500/10"
              >
                🔔 Push Center
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/inspectors"
                className="rounded-xl border border-orange-500 px-5 py-3 font-black text-orange-300 transition hover:bg-orange-500/10"
              >
                🧑‍🔧 Inspectors
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/live"
                className="rounded-xl border border-blue-500 px-5 py-3 font-black text-blue-300 transition hover:bg-blue-500/10"
              >
                ⚡ Live Activity
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/support"
                className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500 px-5 py-3 font-black text-fuchsia-300 transition hover:bg-fuchsia-500/10"
              >
                💬 Support Chat
                <SupportUnreadBadge />
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner/system"
                className="rounded-xl border border-slate-500 px-5 py-3 font-black text-slate-200 transition hover:bg-slate-700/30"
              >
                🩺 System Health
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard"
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Back to Dashboard
              </FastLinkButton>
            </div>
          </div>
        </section>

        <AIBudgetStatus />

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Users" value={String(totalUsers)} helper="Profiles or company user records." tone="teal" />
          <MetricCard label="Active Inspectors" value={String(activeInspectorIds.size)} helper={`Out of ${inspectorIds.size} inspectors with report activity.`} tone="green" />
          <MetricCard label="Reports Created" value={String(reportsCreated)} helper={`${reportsThisMonth} created this month.`} tone="blue" />
          <MetricCard label="Revenue" value={money(revenue)} helper={`${money(revenueThisMonth)} this month.`} tone="green" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Report Viewed" value={String(reportViewedEvents.length)} helper="Client portal, share, and environmental opens." tone="purple" />
          <MetricCard label="Agreement Signed" value={String(agreementSignedEvents.length)} helper="Tracked agreement signature events." tone="teal" />
          <MetricCard label="Payment Received" value={String(paymentReceivedEvents.length)} helper="Tracked payment notification events." tone="green" />
          <MetricCard label="Review Submitted" value={String(reviewEvents.length)} helper="Review-related tracked events." tone="yellow" />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Downloads / Installs" value={String(downloads)} helper="Internal install/first-open tracking. App Store Connect must be checked separately for official downloads." tone="blue" />
          <MetricCard label="Active Devices" value={String(activeDevices.size)} helper="Unique devices active in the last 30 days." tone="teal" />
          <MetricCard label="Retention" value={`${retentionRate}%`} helper="Devices with install/first-open and recent activity." tone="purple" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Findings" value={String(liveFindings.length)} helper="Findings across live, non-demo reports." tone="orange" />
          <MetricCard label="Total Photos" value={String(livePhotos.length)} helper="Report photos connected to live inspections." tone="blue" />
          <MetricCard label="Average Paid Report" value={money(averageInspectionPrice)} helper="Average revenue from paid inspections." tone="green" />
          <MetricCard label="Invoices Paid" value={String(invoicesPaid.length)} helper="Paid invoice records detected." tone="green" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Native Push Devices" value={String(nativePushEnabled.length)} helper="Enabled iOS native APNs tokens." tone="purple" />
          <MetricCard label="Web Push Devices" value={String(webPushEnabled.length)} helper="Enabled browser push subscriptions." tone="teal" />
          <MetricCard label="Total Push Devices" value={String(totalPushDevices)} helper="Native plus web push endpoints." tone="blue" />
          <MetricCard label="New Devices 7 Days" value={String(newDevices7.size)} helper={`${newDevices30.size} active/new devices in 30 days.`} tone="yellow" />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Managed Users" value={String(userManagementRows.length)} helper={`${inactiveUsers} inactive, deleted, or pending deletion.`} tone="orange" />
          <MetricCard label="Top Inspector" value={topInspector?.name || "N/A"} helper={topInspector ? `${topInspector.reports} reports • ${money(topInspector.revenue)}` : "No report activity yet."} tone="teal" />
          <MetricCard label="Push Subscriptions" value={String(pushSubscriptions.length)} helper="Saved browser/device push subscriptions." tone="purple" />
          <MetricCard label="Demo Reports" value={String(demoReports.length)} helper="Public sample reports created for marketing." tone="purple" />
        </section>

        <Panel title="Preview Portals" subtitle="See what real inspectors' realtors and clients actually see, using your live data - no test accounts needed.">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">
                Realtor Portal
              </p>
              {previewRealtors.length === 0 ? (
                <EmptyState text="No realtor contacts found yet." />
              ) : (
                <div className="space-y-2">
                  {previewRealtors.map((realtor) => (
                    <a
                      key={realtor.email}
                      href={`/realtor-portal?preview=${encodeURIComponent(realtor.email)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#020817]/70 px-4 py-3 transition hover:border-purple-500/50"
                    >
                      <span className="truncate text-sm font-bold text-white">{realtor.email}</span>
                      <span className="ml-3 shrink-0 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-black text-purple-300">
                        {realtor.count} report{realtor.count === 1 ? "" : "s"}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">
                Client Portal
              </p>
              {previewClientReports.length === 0 ? (
                <EmptyState text="No client-linked reports found yet." />
              ) : (
                <div className="space-y-2">
                  {previewClientReports.map((report) => (
                    <a
                      key={report.id}
                      href={`/client-portal/${encodeURIComponent(report.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#020817]/70 px-4 py-3 transition hover:border-emerald-500/50"
                    >
                      <span className="truncate text-sm font-bold text-white">{report.address}</span>
                      <span className="ml-3 shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">
                        Open
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Demo Report Management" subtitle="Public sample reports created from real reports with client, realtor, agreement, and payment details removed.">
          {demoReports.length === 0 ? (
            <EmptyState text="No demo reports created yet." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {demoReports.slice(0, 12).map((demo: any) => {
                const demoAddress =
                  demo?.property_address ||
                  demo?.address ||
                  `Demo Report #${demo?.id}`;

                const demoUrl = `/demo/${demo.id}`;

                return (
                  <div
                    key={demo.id}
                    className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-5 shadow-xl"
                  >
                    <p className="text-xs font-black uppercase tracking-wide text-fuchsia-300">
                      Demo Report
                    </p>

                    <h3 className="mt-2 line-clamp-2 text-lg font-black text-white">
                      {demoAddress}
                    </h3>

                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      <p>Demo ID: #{demo.id}</p>
                      <p>Source Report: #{demo.demo_source_inspection_id || "N/A"}</p>
                      <p>Created: {formatDateTime(demo.demo_created_at || demo.created_at)}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <FastLinkButton
                        href={demoUrl}
                        className="rounded-lg border border-teal-500 px-3 py-2 text-xs font-black text-teal-300 transition hover:bg-teal-500/10"
                      >
                        View Demo
                      </FastLinkButton>

                      <Link
                        href={demoUrl}
                        target="_blank"
                        className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-slate-800"
                      >
                        Open Public Link
                      </Link>

                      <DeleteDemoReportButton demoInspectionId={String(demo.id)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Owner User Management" subtitle="System-wide user and inspector performance. Sorted by revenue and report activity.">
          {userManagementRows.length === 0 ? (
            <EmptyState text="No users found." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-[#020817] text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 text-right">Reports</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3">Last Activity</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-[#020817]/60">
                    {userManagementRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-900/70">
                        <td className="px-4 py-4">
                          <div className="max-w-[280px]">
                            <p className="truncate font-black text-white">{row.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-400">{row.email || "No email"}</p>
                            <p className="mt-1 truncate text-[11px] text-slate-600">{row.source}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-xs font-black text-teal-300">
                            {row.role || "user"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-white">{row.reports}</td>
                        <td className="px-4 py-4 text-right font-black text-green-300">{money(row.revenue)}</td>
                        <td className="px-4 py-4 text-slate-300">{formatDateTime(row.lastActivity || row.createdAt)}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full border px-2 py-1 text-xs font-black ${getUserStatusClass(row)}`}>
                            {getUserStatusLabel(row)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Growth Metrics" subtitle="Users, reports, and revenue by month.">
            {growthRows.length === 0 ? (
              <EmptyState text="No growth data yet." />
            ) : (
              <div className="space-y-5">
                {growthRows.map((row) => (
                  <div key={row.month} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <p className="font-black text-white">{row.month}</p>
                      <p className="text-sm text-slate-400">{money(row.revenue)}</p>
                    </div>

                    <GrowthBar label="Users" value={row.users} max={maxUsers} tone="teal" />
                    <GrowthBar label="Reports" value={row.reports} max={maxReports} tone="blue" />
                    <GrowthBar label="Revenue" value={row.revenue} max={maxRevenue} tone="green" display={money(row.revenue)} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Push Notification Setup" subtitle="Enable browser/app notifications for owner activity alerts.">
            <PushNotificationSetup />

            <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Subscriptions</p>
              <p className="mt-2 text-3xl font-black text-white">{pushSubscriptions.length}</p>
              <p className="mt-2 text-sm text-slate-400">Saved browser/device push subscriptions.</p>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Panel title="Device Breakdown" subtitle="Internal usage by platform and app version.">
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniStat label="iOS Events" value={String(iosDeviceEvents.length)} />
              <MiniStat label="Web Events" value={String(webDeviceEvents.length)} />
            </div>

            <div className="mt-5 space-y-3">
              {appVersionRows.length === 0 ? (
                <EmptyState text="No app version data yet." />
              ) : (
                appVersionRows.map((row) => (
                  <SimpleRow key={row.version} label={`Version ${row.version}`} value={String(row.count)} />
                ))
              )}
            </div>
          </Panel>

          <Panel title="Top Sections Flagged" subtitle="Most common report sections with findings.">
            {topSectionRows.length === 0 ? (
              <EmptyState text="No finding section data yet." />
            ) : (
              <div className="space-y-3">
                {topSectionRows.map((row) => (
                  <SimpleRow key={row.section} label={row.section} value={String(row.count)} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Severity Breakdown" subtitle="Finding severity counts across live reports.">
            {severityRows.length === 0 ? (
              <EmptyState text="No severity data yet." />
            ) : (
              <div className="space-y-3">
                {severityRows.map((row) => (
                  <SimpleRow key={row.severity} label={row.severity} value={String(row.count)} />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Most Used Templates" subtitle="Favorite/comment template usage when tracking is available.">
            {templateUsageRows.length === 0 ? (
              <EmptyState text="No template usage data yet." />
            ) : (
              <div className="space-y-3">
                {templateUsageRows.map((row) => (
                  <SimpleRow
                    key={`${row.title}-${row.section}`}
                    label={row.title}
                    value={row.count > 0 ? String(row.count) : row.section}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Push Device Health" subtitle="Native APNs and browser push endpoint status.">
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniStat label="Native" value={String(nativePushEnabled.length)} />
              <MiniStat label="Web" value={String(webPushEnabled.length)} />
              <MiniStat label="Total" value={String(totalPushDevices)} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Native push device counts will increase after users install the iOS build with native push enabled and tap Enable Native iOS Push.
            </p>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Recent Signups" subtitle="Newest users from profiles/company user records.">
            {recentUsers.length === 0 ? (
              <EmptyState text="No recent signups found." />
            ) : (
              <div className="space-y-3">
                {recentUsers.map((row: any, index: number) => {
                  const email = getUserEmail(row) || "No email";
                  const name = getUserName(row);

                  return (
                    <div key={row?.id || row?.user_id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{name}</p>
                          <p className="mt-1 truncate text-sm text-slate-400">{email}</p>
                        </div>
                        <p className="shrink-0 text-xs font-bold text-slate-500">{formatDate(row?.created_at || row?.inserted_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Recent System Activity" subtitle="Report views, agreements, payments, and review events.">
            {recentEvents.length === 0 ? (
              <EmptyState text="No system activity yet." />
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event: any, index: number) => (
                  <div key={event?.id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-white">{getViewType(event) || "activity"}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Inspection #{event?.inspection_id_bigint || event?.inspection_id || "N/A"}
                          {event?.viewer_email ? ` • ${event.viewer_email}` : ""}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-slate-500">{formatDateTime(event?.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="rounded-2xl border border-yellow-500/30 bg-yellow-950/10 p-5 text-sm leading-6 text-yellow-100">
          <strong>App Store Analytics Note:</strong> Apple download and retention numbers are not available through Supabase automatically. This dashboard tracks internal installs, first opens, and device activity after you add the tracker component. For official App Store downloads, still check App Store Connect.
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: Tone }) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/40 bg-teal-950/20 text-teal-300",
    green: "border-green-500/40 bg-green-950/20 text-green-300",
    blue: "border-blue-500/40 bg-blue-950/20 text-blue-300",
    purple: "border-purple-500/40 bg-purple-950/20 text-purple-300",
    orange: "border-orange-500/40 bg-orange-950/20 text-orange-300",
    yellow: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300",
    red: "border-red-500/40 bg-red-950/20 text-red-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${classes[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 text-4xl font-black text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{helper}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
      <h2 className="text-2xl font-black text-teal-300">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">{text}</div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function SimpleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="min-w-0 truncate font-bold text-slate-200">{label}</p>
      <p className="shrink-0 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-300">{value}</p>
    </div>
  );
}

function GrowthBar({ label, value, max, tone, display }: { label: string; value: number; max: number; tone: "teal" | "blue" | "green"; display?: string }) {
  const width = Math.max(4, Math.round(((value || 0) / Math.max(1, max)) * 100));
  const color = tone === "green" ? "bg-green-400" : tone === "blue" ? "bg-blue-400" : "bg-teal-400";

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-bold text-slate-300">{label}</span>
        <span className="text-slate-400">{display || value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#020617]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
