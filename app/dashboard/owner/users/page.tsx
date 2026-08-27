import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import OwnerAccountActions from "../../../../components/OwnerAccountActions";
import UserRoleTabs from "../../../../components/UserRoleTabs";

function userRoleCategory(role: string, reports = 0) {
  if (reports > 0) return "inspector";
  const r = String(role || "").toLowerCase();
  if (r.includes("inspector")) return "inspector";
  if (r.includes("realtor") || r.includes("agent")) return "realtor";
  if (r.includes("client") || r.includes("buyer") || r.includes("co-client")) return "client";
  return "other";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;



type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
  lastActivity: string | null;
  reports: number;
  reports7: number;
  reports30: number;
  revenue: number;
  findings: number;
  photos: number;
  scheduled: number;
  published: number;
  sent: number;
  paid: number;
  lastScheduled: string | null;
  lastPublished: string | null;
  lastSent: string | null;
  lastPaid: string | null;
  nativePush: boolean;
  webPush: boolean;
  active7: boolean;
  active30: boolean;
  appVersion: string;
  platform: string;
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

async function safeSelect<T = any>(
  query: PromiseLike<{ data: T | null; error: any }>,
  label: string
) {
  try {
    const { data, error } = await query;

    if (error) {
      console.error(`Owner users ${label} error:`, error);
      return [] as any[];
    }

    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner users ${label} exception:`, error);
    return [] as any[];
  }
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDateTime(value: any) {
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

function isAfter(value: any, compareDate: Date) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date >= compareDate;
}

function getUserEmail(row: any) {
  return String(
    row?.email ||
      row?.user_email ||
      row?.owner_email ||
      row?.auth_email ||
      ""
  ).toLowerCase();
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
  return String(
    row?.role ||
      row?.account_type ||
      row?.user_role ||
      (row?.inspector_id ? "inspector" : "") ||
      "user"
  ).toLowerCase();
}

function getUserKey(row: any) {
  return String(
    row?.id ||
      row?.user_id ||
      row?.auth_user_id ||
      row?.inspector_id ||
      getUserEmail(row) ||
      ""
  );
}

function getInspectorId(inspection: any) {
  return String(inspection?.inspector_id || inspection?.user_id || "");
}

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function getPaidAmount(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getInspectionPrice(inspection: any) {
  return (
    getNumber(inspection?.price) ||
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    0
  );
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);

  return price > 0 && paid >= price;
}

function getInspectionRevenue(inspection: any) {
  if (!isPaymentComplete(inspection)) return 0;
  return getPaidAmount(inspection) || getInspectionPrice(inspection);
}

function isPublishedInspection(inspection: any) {
  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    Boolean(inspection?.published_at)
  );
}

// Keep whichever timestamp is newer (string ISO compare is safe for ISO dates).
function newestDate(current: string | null, candidate: any): string | null {
  if (!candidate) return current;
  const c = String(candidate);
  return !current || c > current ? c : current;
}

// A short "Aug 14, 2026" label plus whether it's 30+ days stale.
function shortDate(value: any): { label: string; stale: boolean } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    stale: days >= 30,
  };
}

function getPlatformFromEvents(events: any[]) {
  const latest = events[0];

  const platform = String(latest?.platform || "").toLowerCase();
  const ua = String(latest?.user_agent || "").toLowerCase();

  if (platform.includes("ios") || platform.includes("iphone") || ua.includes("iphone") || ua.includes("ipad")) {
    return "iOS";
  }

  if (platform.includes("android") || ua.includes("android")) {
    return "Android";
  }

  if (platform.includes("web")) {
    return "Web";
  }

  return latest ? "Web/Unknown" : "N/A";
}

function getAppVersionFromEvents(events: any[]) {
  for (const event of events) {
    const version =
      event?.metadata?.app_version ||
      event?.metadata?.appVersion ||
      event?.app_version;

    if (version) return String(version);
  }

  return "Unknown";
}

function buildRows({
  profiles,
  inspectorProfiles,
  companyUsers,
  inspections,
  findings,
  photos,
  reportEmails,
  nativePushTokens,
  webPushSubscriptions,
  deviceEvents,
}: {
  profiles: any[];
  inspectorProfiles: any[];
  companyUsers: any[];
  inspections: any[];
  findings: any[];
  photos: any[];
  reportEmails: any[];
  nativePushTokens: any[];
  webPushSubscriptions: any[];
  deviceEvents: any[];
}) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
  const rows = new Map<string, UserRow>();

  function upsertUser(row: any, source: string) {
    const key = getUserKey(row);
    if (!key) return;

    const current = rows.get(key);
    const email = getUserEmail(row) || current?.email || "";
    const createdAt = row?.created_at || row?.inserted_at || current?.createdAt || null;

    rows.set(key, {
      id: key,
      name: getUserName(row) || current?.name || "Unknown User",
      email,
      role: getUserRole(row) || current?.role || "user",
      createdAt,
      lastActivity: current?.lastActivity || createdAt,
      reports: current?.reports || 0,
      reports7: current?.reports7 || 0,
      reports30: current?.reports30 || 0,
      revenue: current?.revenue || 0,
      findings: current?.findings || 0,
      photos: current?.photos || 0,
      scheduled: current?.scheduled || 0,
      published: current?.published || 0,
      sent: current?.sent || 0,
      paid: current?.paid || 0,
      lastScheduled: current?.lastScheduled || null,
      lastPublished: current?.lastPublished || null,
      lastSent: current?.lastSent || null,
      lastPaid: current?.lastPaid || null,
      nativePush: current?.nativePush || false,
      webPush: current?.webPush || false,
      active7: current?.active7 || false,
      active30: current?.active30 || false,
      appVersion: current?.appVersion || "Unknown",
      platform: current?.platform || "N/A",
      source: current?.source ? `${current.source}, ${source}` : source,
    });
  }

  profiles.forEach((row) => upsertUser(row, "profiles"));
  companyUsers.forEach((row) => upsertUser(row, "company_users"));
  inspectorProfiles.forEach((row) =>
    upsertUser(
      {
        ...row,
        id: row.inspector_id || row.id,
        role: "inspector",
      },
      "inspector_profiles"
    )
  );

  inspections.forEach((inspection) => {
    const inspectorId = getInspectorId(inspection);
    if (!inspectorId) return;

    if (!rows.has(inspectorId)) {
      rows.set(inspectorId, {
        id: inspectorId,
        name: "Inspector",
        email: "",
        role: "inspector",
        createdAt: null,
        lastActivity: null,
        reports: 0,
        reports7: 0,
        reports30: 0,
        revenue: 0,
        findings: 0,
        photos: 0,
        scheduled: 0,
        published: 0,
        sent: 0,
        paid: 0,
        lastScheduled: null,
        lastPublished: null,
        lastSent: null,
        lastPaid: null,
        nativePush: false,
        webPush: false,
        active7: false,
        active30: false,
        appVersion: "Unknown",
        platform: "N/A",
        source: "inspections",
      });
    }

    const current = rows.get(inspectorId)!;
    const date = getInspectionDate(inspection);
    // Use the real report-creation timestamp for "last activity" - NOT the
    // scheduled inspection_date, which is date-only and renders as a
    // misleading fixed time (midnight UTC shifted into the local timezone).
    const activityTs = inspection?.created_at || null;

    current.reports += 1;
    if (isAfter(date, sevenDaysAgo)) current.reports7 += 1;
    if (isAfter(date, thirtyDaysAgo)) current.reports30 += 1;
    current.revenue += getInspectionRevenue(inspection);

    // Activation flow: scheduled -> published -> (sent, handled below) -> paid,
    // each with the date it last happened.
    if (inspection?.inspection_date) {
      current.scheduled += 1;
      current.lastScheduled = newestDate(current.lastScheduled, inspection?.created_at || inspection?.inspection_date);
    }
    if (isPublishedInspection(inspection)) {
      current.published += 1;
      current.lastPublished = newestDate(current.lastPublished, inspection?.published_at || inspection?.created_at);
    }
    if (isPaymentComplete(inspection)) {
      current.paid += 1;
      current.lastPaid = newestDate(current.lastPaid, inspection?.paid_at || inspection?.created_at);
    }

    const currentTime = current.lastActivity
      ? new Date(current.lastActivity).getTime()
      : 0;
    const nextTime = activityTs ? new Date(activityTs).getTime() : 0;

    if (!Number.isNaN(nextTime) && nextTime > currentTime) {
      current.lastActivity = activityTs;
    }
  });

  const inspectionOwner = new Map<string, string>();
  inspections.forEach((inspection) => {
    const inspectionId = String(inspection?.id || "");
    const inspectorId = getInspectorId(inspection);
    if (inspectionId && inspectorId) inspectionOwner.set(inspectionId, inspectorId);
  });

  // "Sent" = a report email actually went out for that inspection. Count each
  // inspection once (a report can be re-emailed), and track the latest send.
  const sentPairs = new Set<string>();
  reportEmails.forEach((email) => {
    const inspectionId = String(email?.inspection_id_bigint || "");
    if (!inspectionId) return;
    const inspectorId = inspectionOwner.get(inspectionId);
    if (!inspectorId || !rows.has(inspectorId)) return;
    const row = rows.get(inspectorId)!;
    const pairKey = `${inspectorId}:${inspectionId}`;
    if (!sentPairs.has(pairKey)) {
      sentPairs.add(pairKey);
      row.sent += 1;
    }
    row.lastSent = newestDate(row.lastSent, email?.sent_at || email?.created_at);
  });

  findings.forEach((finding) => {
    const inspectionId = String(finding?.inspection_id || finding?.report_id || "");
    const inspectorId = inspectionOwner.get(inspectionId);
    if (!inspectorId || !rows.has(inspectorId)) return;
    rows.get(inspectorId)!.findings += 1;
  });

  photos.forEach((photo) => {
    const inspectionId = String(photo?.inspection_id || photo?.report_id || "");
    const inspectorId = inspectionOwner.get(inspectionId);
    if (!inspectorId || !rows.has(inspectorId)) return;
    rows.get(inspectorId)!.photos += 1;
  });

  nativePushTokens.forEach((token) => {
    const userId = String(token?.user_id || "");
    const email = String(token?.user_email || "").toLowerCase();
    const matching =
      rows.get(userId) ||
      [...rows.values()].find((row) => row.email && row.email.toLowerCase() === email);

    if (!matching) return;
    if (token?.enabled !== false) matching.nativePush = true;
  });

  webPushSubscriptions.forEach((subscription) => {
    const userId = String(subscription?.user_id || "");
    const email = String(subscription?.user_email || "").toLowerCase();
    const matching =
      rows.get(userId) ||
      [...rows.values()].find((row) => row.email && row.email.toLowerCase() === email);

    if (!matching) return;
    if (subscription?.enabled !== false) matching.webPush = true;
  });

  [...rows.values()].forEach((row) => {
    const matchingEvents = deviceEvents
      .filter((event) => {
        const eventEmail = String(event?.user_email || event?.viewer_email || event?.metadata?.user_email || "").toLowerCase();
        const eventUserId = String(event?.user_id || event?.metadata?.user_id || "");
        return (row.email && eventEmail === row.email.toLowerCase()) || (eventUserId && eventUserId === row.id);
      })
      .sort(
        (a, b) =>
          new Date(b?.created_at || 0).getTime() -
          new Date(a?.created_at || 0).getTime()
      );

    if (matchingEvents.length > 0) {
      const latest = matchingEvents[0]?.created_at || null;
      const currentTime = row.lastActivity ? new Date(row.lastActivity).getTime() : 0;
      const nextTime = latest ? new Date(latest).getTime() : 0;

      if (!Number.isNaN(nextTime) && nextTime > currentTime) {
        row.lastActivity = latest;
      }

      row.platform = getPlatformFromEvents(matchingEvents);
      row.appVersion = getAppVersionFromEvents(matchingEvents);
    }

    row.active7 = isAfter(row.lastActivity, sevenDaysAgo) || row.reports7 > 0;
    row.active30 = isAfter(row.lastActivity, thirtyDaysAgo) || row.reports30 > 0;
  });

  return [...rows.values()].sort(
    (a, b) =>
      Number(b.active30) - Number(a.active30) ||
      b.reports30 - a.reports30 ||
      b.revenue - a.revenue ||
      b.reports - a.reports
  );
}

export default async function OwnerUsersPage() {
  const userClient = await createUserClient();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = String(user.email || "").toLowerCase();

  if (!OWNER_EMAILS.includes(userEmail)) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-red-500/10 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-crit-text)]">
            Owner Only
          </p>
          <h1 className="mt-4 text-4xl font-semibold">Access Restricted</h1>
          <p className="mt-4 text-[var(--fl-muted)]">
            This user management dashboard is only available to the FLOW owner account.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-semibold text-[var(--fl-crit-text)] hover:bg-red-500/10"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();

  const [
    profiles,
    inspectorProfiles,
    companyUsers,
    inspections,
    findings,
    photos,
    reportEmails,
    nativePushTokens,
    webPushSubscriptions,
    deviceEvents,
  ] = await Promise.all([
    safeSelect(admin.from("profiles").select("*"), "profiles"),
    safeSelect(admin.from("inspector_profiles").select("*"), "inspector_profiles"),
    safeSelect(admin.from("company_users").select("*"), "company_users"),
    safeSelect(admin.from("inspections").select("*"), "inspections"),
    safeSelect(admin.from("findings").select("*"), "findings"),
    safeSelect(admin.from("photos").select("*"), "photos"),
    safeSelect(
      admin
        .from("email_logs")
        .select("inspection_id_bigint, email_type, sent_at, created_at")
        .in("email_type", ["inspection_report", "environmental_report"]),
      "email_logs",
    ),
    safeSelect(admin.from("app_native_push_tokens").select("*"), "app_native_push_tokens"),
    safeSelect(admin.from("app_push_subscriptions").select("*"), "app_push_subscriptions"),
    safeSelect(admin.from("app_device_events").select("*").order("created_at", { ascending: false }).limit(2000), "app_device_events"),
  ]);

  const userRows = buildRows({
    profiles,
    inspectorProfiles,
    companyUsers,
    inspections: inspections.filter((inspection: any) => inspection?.is_demo !== true),
    findings,
    photos,
    reportEmails,
    nativePushTokens,
    webPushSubscriptions,
    deviceEvents,
  });

  const totalUsers = userRows.length;
  const inspectors = userRows.filter((row) => row.role.includes("inspector") || row.reports > 0);
  const roleCounts = {
    all: userRows.length,
    inspector: userRows.filter((row) => userRoleCategory(row.role, row.reports) === "inspector").length,
    client: userRows.filter((row) => userRoleCategory(row.role, row.reports) === "client").length,
    realtor: userRows.filter((row) => userRoleCategory(row.role, row.reports) === "realtor").length,
    other: userRows.filter((row) => userRoleCategory(row.role, row.reports) === "other").length,
  };
  const active7 = userRows.filter((row) => row.active7);
  const active30 = userRows.filter((row) => row.active30);
  const pushEnabled = userRows.filter((row) => row.nativePush || row.webPush);
  const revenueTotal = userRows.reduce((sum, row) => sum + row.revenue, 0);
  const reportsTotal = userRows.reduce((sum, row) => sum + row.reports, 0);
  const findingsTotal = userRows.reduce((sum, row) => sum + row.findings, 0);
  const photosTotal = userRows.reduce((sum, row) => sum + row.photos, 0);
  const topInspector = inspectors[0];

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                Owner User Management
              </p>
              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">
                Inspectors & Users
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Owner-only view of app users, inspectors, report activity, revenue, push status, app versions, and recent usage.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/owner"
                className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
              >
                Owner Dashboard
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Users" value={String(totalUsers)} helper="All detected app users." tone="teal" />
          <MetricCard label="Inspectors" value={String(inspectors.length)} helper="Inspector role or report activity." tone="green" />
          <MetricCard label="Active 7 Days" value={String(active7.length)} helper="Users with recent app/report activity." tone="blue" />
          <MetricCard label="Active 30 Days" value={String(active30.length)} helper="Monthly active users." tone="purple" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Reports" value={String(reportsTotal)} helper="Live reports created by users." tone="blue" />
          <MetricCard label="Findings" value={String(findingsTotal)} helper="Total findings across live reports." tone="orange" />
          <MetricCard label="Photos" value={String(photosTotal)} helper="Photos attached to live reports." tone="purple" />
          <MetricCard label="Revenue" value={money(revenueTotal)} helper="Paid or completed inspection revenue." tone="green" />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Push Enabled Users" value={String(pushEnabled.length)} helper="Native or web push enabled." tone="teal" />
          <MetricCard label="Top Inspector" value={topInspector?.name || "N/A"} helper={topInspector ? `${topInspector.reports} reports • ${money(topInspector.revenue)}` : "No inspector activity yet."} tone="green" />
          <MetricCard label="Avg Reports/User" value={totalUsers > 0 ? String(Math.round(reportsTotal / totalUsers)) : "0"} helper="Average report activity per user." tone="yellow" />
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
                User Activity Table
              </h2>
              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Sorted by recent activity, 30-day reports, revenue, and total reports.
              </p>
            </div>

            <p className="rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-xs font-semibold text-[var(--fl-accent-text)]">
              {userRows.length} users
            </p>
          </div>

          <div className="mt-5">
            <UserRoleTabs counts={roleCounts} />
          </div>

          <div className="mt-6 space-y-4">
            {userRows.length === 0 ? (
              <EmptyState text="No users found yet." />
            ) : (
              userRows.map((row) => (
                <div
                  key={row.id}
                  data-user-role={userRoleCategory(row.role, row.reports)}
                  className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 shadow-lg"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--fl-text)]">{row.name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--fl-muted)]">{row.email || "No email"}</p>
                      <p className="mt-1 truncate text-[11px] text-[var(--fl-faint)]">{row.source}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="teal">{row.role || "user"}</Badge>
                        {row.active7 ? (
                          <Badge tone="green">Active 7d</Badge>
                        ) : row.active30 ? (
                          <Badge tone="blue">Active 30d</Badge>
                        ) : (
                          <Badge tone="yellow">Inactive</Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs sm:grid-cols-6">
                      <MiniStat label="Reports" value={String(row.reports)} tone="white" />
                      <MiniStat label="30d" value={String(row.reports30)} tone="blue" />
                      <MiniStat label="Revenue" value={money(row.revenue)} tone="green" />
                      <MiniStat label="Findings" value={String(row.findings)} tone="orange" />
                      <MiniStat label="Photos" value={String(row.photos)} tone="purple" />
                      <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Push</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.nativePush && <Badge tone="purple">Native</Badge>}
                          {row.webPush && <Badge tone="teal">Web</Badge>}
                          {!row.nativePush && !row.webPush && <Badge tone="red">Off</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {userRoleCategory(row.role, row.reports) === "inspector" && (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <FlowStat label="Scheduled" count={row.scheduled} iso={row.lastScheduled} />
                      <FlowStat label="Published" count={row.published} iso={row.lastPublished} />
                      <FlowStat label="Sent" count={row.sent} iso={row.lastSent} />
                      <FlowStat label="Paid" count={row.paid} iso={row.lastPaid} tone="green" />
                      <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Avg Charge</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--fl-good-text)]">
                          {row.paid > 0 ? money(row.revenue / row.paid) : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold text-[var(--fl-faint)]">
                          {row.paid > 0 ? `${money(row.revenue)} collected` : "no payments"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px_1fr]">
                    <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Platform</p>
                      <p className="mt-1 font-semibold text-[var(--fl-text)]">{row.platform}</p>
                      <p className="mt-1 text-[var(--fl-faint)]">Version: {row.appVersion}</p>
                    </div>

                    <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Last Activity</p>
                      <p className="mt-1 font-semibold text-[var(--fl-text)]">{formatDateTime(row.lastActivity || row.createdAt)}</p>
                    </div>

                    <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Actions</p>
                      <OwnerAccountActions userId={row.id} email={row.email} currentRole={row.role} compact />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Most Active Inspectors" subtitle="Ranked by report count and revenue.">
            {inspectors.length === 0 ? (
              <EmptyState text="No inspector activity yet." />
            ) : (
              <div className="space-y-3">
                {inspectors.slice(0, 10).map((row) => (
                  <RankRow
                    key={row.id}
                    title={row.name}
                    subtitle={`${row.reports} reports • ${row.reports30} in 30 days`}
                    value={money(row.revenue)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Push-Enabled Users" subtitle="Users with native or browser push enabled.">
            {pushEnabled.length === 0 ? (
              <EmptyState text="No push-enabled users yet." />
            ) : (
              <div className="space-y-3">
                {pushEnabled.slice(0, 10).map((row) => (
                  <RankRow
                    key={row.id}
                    title={row.name}
                    subtitle={`${row.nativePush ? "Native iOS" : ""}${row.nativePush && row.webPush ? " + " : ""}${row.webPush ? "Web Push" : ""}`}
                    value={row.platform}
                  />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-sm leading-6 text-[var(--fl-warn-text)]">
          <strong>Note:</strong> Activity, platform, and app version details depend on device analytics events being recorded from the user&apos;s device. Native push status will populate after iOS users enable push inside the updated app.
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
    green: "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]",
    blue: "border-blue-500/40 bg-blue-500/10 text-[var(--fl-info-text)]",
    purple: "border-purple-500/40 bg-purple-500/10 text-[var(--fl-purple-text)]",
    orange: "border-orange-500/40 bg-orange-500/10 text-[var(--fl-warn-text)]",
    yellow: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
    red: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${classes[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
      <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--fl-muted)]">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
      {text}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: Tone;
}) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/30 bg-teal-500/10 text-[var(--fl-accent-text)]",
    green: "border-green-500/30 bg-green-500/10 text-[var(--fl-good-text)]",
    blue: "border-blue-500/30 bg-blue-500/10 text-[var(--fl-info-text)]",
    purple: "border-purple-500/30 bg-purple-500/10 text-[var(--fl-purple-text)]",
    orange: "border-orange-500/30 bg-orange-500/10 text-[var(--fl-warn-text)]",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-[var(--fl-warn-text)]",
    red: "border-red-500/30 bg-red-500/10 text-[var(--fl-crit-text)]",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}


function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "white" | "blue" | "green" | "orange" | "purple";
}) {
  const classes = {
    white: "text-[var(--fl-text)]",
    blue: "text-[var(--fl-info-text)]",
    green: "text-[var(--fl-good-text)]",
    orange: "text-[var(--fl-warn-text)]",
    purple: "text-[var(--fl-purple-text)]",
  } as const;

  return (
    <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold ${classes[tone]}`}>
        {value}
      </p>
    </div>
  );
}

// A flow-step cell: a count on top, and the date it last happened underneath
// (amber when it's been 30+ days). Answers "did they do it, and how recently."
function FlowStat({
  label,
  count,
  iso,
  tone,
}: {
  label: string;
  count: number;
  iso: string | null;
  tone?: "green";
}) {
  const d = count > 0 ? shortDate(iso) : null;

  return (
    <div className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold ${
          count === 0 ? "text-[var(--fl-faint)]" : tone === "green" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-text)]"
        }`}
      >
        {count}
      </p>
      <p
        className={`mt-0.5 text-[10px] font-bold ${
          count === 0 ? "text-[var(--fl-faint)]" : d?.stale ? "text-[var(--fl-warn-text)]" : "text-[var(--fl-faint)]"
        }`}
      >
        {count === 0 ? "—" : d ? d.label : "—"}
      </p>
    </div>
  );
}

function RankRow({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--fl-text)]">{title}</p>
        <p className="mt-1 truncate text-sm text-[var(--fl-muted)]">{subtitle}</p>
      </div>
      <p className="shrink-0 font-semibold text-[var(--fl-accent-text)]">{value}</p>
    </div>
  );
}
