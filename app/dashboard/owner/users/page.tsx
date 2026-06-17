import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import OwnerAccountActions from "../../../../components/OwnerAccountActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

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

  return date.toLocaleString("en-US", {
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

  return date.toLocaleDateString("en-US", {
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

    current.reports += 1;
    if (isAfter(date, sevenDaysAgo)) current.reports7 += 1;
    if (isAfter(date, thirtyDaysAgo)) current.reports30 += 1;
    current.revenue += getInspectionRevenue(inspection);

    const currentTime = current.lastActivity
      ? new Date(current.lastActivity).getTime()
      : 0;
    const nextTime = date ? new Date(date).getTime() : 0;

    if (!Number.isNaN(nextTime) && nextTime > currentTime) {
      current.lastActivity = date;
    }
  });

  const inspectionOwner = new Map<string, string>();
  inspections.forEach((inspection) => {
    const inspectionId = String(inspection?.id || "");
    const inspectorId = getInspectorId(inspection);
    if (inspectionId && inspectorId) inspectionOwner.set(inspectionId, inspectorId);
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
      <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-red-300">
            Owner Only
          </p>
          <h1 className="mt-4 text-4xl font-black">Access Restricted</h1>
          <p className="mt-4 text-slate-300">
            This user management dashboard is only available to the On Point Inspect owner account.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-black text-red-300 hover:bg-red-500/10"
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
    nativePushTokens,
    webPushSubscriptions,
    deviceEvents,
  });

  const totalUsers = userRows.length;
  const inspectors = userRows.filter((row) => row.role.includes("inspector") || row.reports > 0);
  const active7 = userRows.filter((row) => row.active7);
  const active30 = userRows.filter((row) => row.active30);
  const pushEnabled = userRows.filter((row) => row.nativePush || row.webPush);
  const revenueTotal = userRows.reduce((sum, row) => sum + row.revenue, 0);
  const reportsTotal = userRows.reduce((sum, row) => sum + row.reports, 0);
  const findingsTotal = userRows.reduce((sum, row) => sum + row.findings, 0);
  const photosTotal = userRows.reduce((sum, row) => sum + row.photos, 0);
  const topInspector = inspectors[0];

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                Owner User Management
              </p>
              <h1 className="mt-4 text-5xl font-black text-white">
                Inspectors & Users
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Owner-only view of app users, inspectors, report activity, revenue, push status, app versions, and recent usage.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/owner"
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Owner Dashboard
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-600 px-5 py-3 font-black text-slate-200 transition hover:bg-slate-800"
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

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-teal-300">
                User Activity Table
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Sorted by recent activity, 30-day reports, revenue, and total reports.
              </p>
            </div>

            <p className="rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-xs font-black text-teal-300">
              {userRows.length} users
            </p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-700">
            <div className="min-w-[1700px]">
              <table className="w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-[#020817] text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Reports</th>
                    <th className="px-4 py-3 text-right">30d</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Findings</th>
                    <th className="px-4 py-3 text-right">Photos</th>
                    <th className="px-4 py-3">Push</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="min-w-[130px] px-4 py-3">Last Activity</th>
                    <th className="min-w-[190px] px-4 py-3">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 bg-[#020817]/60">
                  {userRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/70">
                      <td className="px-4 py-4">
                        <div className="max-w-[280px]">
                          <p className="truncate font-black text-white">{row.name}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{row.email || "No email"}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-600">{row.source}</p>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <Badge tone="teal">{row.role || "user"}</Badge>
                      </td>

                      <td className="px-4 py-4">
                        {row.active7 ? (
                          <Badge tone="green">Active 7d</Badge>
                        ) : row.active30 ? (
                          <Badge tone="blue">Active 30d</Badge>
                        ) : (
                          <Badge tone="yellow">Inactive</Badge>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-black text-white">{row.reports}</td>
                      <td className="px-4 py-4 text-right font-black text-blue-300">{row.reports30}</td>
                      <td className="px-4 py-4 text-right font-black text-green-300">{money(row.revenue)}</td>
                      <td className="px-4 py-4 text-right font-black text-orange-300">{row.findings}</td>
                      <td className="px-4 py-4 text-right font-black text-purple-300">{row.photos}</td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {row.nativePush && <Badge tone="purple">Native</Badge>}
                          {row.webPush && <Badge tone="teal">Web</Badge>}
                          {!row.nativePush && !row.webPush && <Badge tone="red">Off</Badge>}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-slate-300">{row.platform}</td>
                      <td className="px-4 py-4 text-slate-300">{row.appVersion}</td>
                      <td className="min-w-[130px] px-4 py-4 text-slate-300">{formatDateTime(row.lastActivity || row.createdAt)}</td>
                      <td className="min-w-[190px] px-4 py-4 align-top"><OwnerAccountActions userId={row.id} email={row.email} currentRole={row.role} compact /></td>
                    </tr>
                  ))}

                  {userRows.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-10 text-center text-slate-400">
                        No users found yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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

        <section className="rounded-2xl border border-yellow-500/30 bg-yellow-950/10 p-5 text-sm leading-6 text-yellow-100">
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
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{helper}</p>
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
    <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
      <h2 className="text-2xl font-black text-teal-300">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">
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
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    green: "border-green-500/30 bg-green-500/10 text-green-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-black ${classes[tone]}`}>
      {children}
    </span>
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div className="min-w-0">
        <p className="truncate font-black text-white">{title}</p>
        <p className="mt-1 truncate text-sm text-slate-400">{subtitle}</p>
      </div>
      <p className="shrink-0 font-black text-teal-300">{value}</p>
    </div>
  );
}
