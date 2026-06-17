import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

type DeviceRow = {
  deviceId: string;
  firstSeen: string | null;
  lastSeen: string | null;
  events: number;
  platform: string;
  appVersion: string;
  userAgent: string;
  standalone: boolean;
  installEvent: boolean;
  active7: boolean;
  active30: boolean;
  lastPath: string;
  timezone: string;
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
      console.error(`Owner device analytics ${label} error:`, error);
      return [] as any[];
    }

    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner device analytics ${label} exception:`, error);
    return [] as any[];
  }
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

function isAfter(value: any, compareDate: Date) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date >= compareDate;
}

function getEventType(event: any) {
  return String(event?.event_type || event?.eventType || "").toLowerCase();
}

function isInstallEvent(event: any) {
  return ["install", "app_install", "pwa_install", "first_open"].includes(
    getEventType(event)
  );
}

function getDeviceId(event: any) {
  return String(
    event?.device_id ||
      event?.deviceId ||
      event?.user_agent ||
      event?.id ||
      "unknown"
  );
}

function getAppVersion(event: any) {
  return String(
    event?.metadata?.app_version ||
      event?.metadata?.appVersion ||
      event?.app_version ||
      "Unknown"
  );
}

function getTimezone(event: any) {
  return String(event?.metadata?.timezone || event?.timezone || "N/A");
}

function getPlatform(event: any) {
  const platform = String(event?.platform || "").toLowerCase();
  const userAgent = String(event?.user_agent || "").toLowerCase();

  if (
    platform.includes("ios") ||
    platform.includes("iphone") ||
    platform.includes("ipad") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad")
  ) {
    return "iOS";
  }

  if (platform.includes("android") || userAgent.includes("android")) {
    return "Android";
  }

  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "Mac";
  }

  if (platform.includes("windows") || userAgent.includes("windows")) {
    return "Windows";
  }

  if (platform.includes("web")) {
    return "Web";
  }

  return platform ? platform : "Unknown";
}

function getMonthKey(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getDayKey(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildDeviceRows(events: any[]) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
  const map = new Map<string, DeviceRow>();

  events.forEach((event) => {
    const deviceId = getDeviceId(event);
    const createdAt = event?.created_at || null;

    if (!deviceId || deviceId === "unknown") return;

    const existing = map.get(deviceId);
    const existingFirst = existing?.firstSeen
      ? new Date(existing.firstSeen).getTime()
      : Number.POSITIVE_INFINITY;
    const existingLast = existing?.lastSeen
      ? new Date(existing.lastSeen).getTime()
      : 0;
    const currentTime = createdAt ? new Date(createdAt).getTime() : 0;

    const nextFirstSeen =
      !existing || (!Number.isNaN(currentTime) && currentTime < existingFirst)
        ? createdAt
        : existing.firstSeen;

    const isLatest =
      !existing || (!Number.isNaN(currentTime) && currentTime >= existingLast);

    const nextLastSeen = isLatest ? createdAt : existing.lastSeen;

    map.set(deviceId, {
      deviceId,
      firstSeen: nextFirstSeen,
      lastSeen: nextLastSeen,
      events: (existing?.events || 0) + 1,
      platform: isLatest ? getPlatform(event) : existing?.platform || "Unknown",
      appVersion: isLatest ? getAppVersion(event) : existing?.appVersion || "Unknown",
      userAgent: isLatest ? String(event?.user_agent || "") : existing?.userAgent || "",
      standalone: Boolean(existing?.standalone || event?.standalone === true),
      installEvent: Boolean(existing?.installEvent || isInstallEvent(event)),
      active7: Boolean(existing?.active7 || isAfter(createdAt, sevenDaysAgo)),
      active30: Boolean(existing?.active30 || isAfter(createdAt, thirtyDaysAgo)),
      lastPath: isLatest ? String(event?.path || "/") : existing?.lastPath || "/",
      timezone: isLatest ? getTimezone(event) : existing?.timezone || "N/A",
    });
  });

  return [...map.values()].sort(
    (a, b) =>
      new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()
  );
}

function countBy<T>(items: T[], getter: (item: T) => string) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = getter(item) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function OwnerDeviceAnalyticsPage() {
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
            This device analytics page is only available to the On Point Inspect owner account.
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
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

  const [deviceEvents, nativePushTokens, webPushSubscriptions] = await Promise.all([
    safeSelect(
      admin
        .from("app_device_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000),
      "app_device_events"
    ),
    safeSelect(
      admin
        .from("app_native_push_tokens")
        .select("*")
        .order("updated_at", { ascending: false }),
      "app_native_push_tokens"
    ),
    safeSelect(
      admin
        .from("app_push_subscriptions")
        .select("*")
        .order("created_at", { ascending: false }),
      "app_push_subscriptions"
    ),
  ]);

  const deviceRows = buildDeviceRows(deviceEvents);

  const totalDevices = deviceRows.length;
  const active7Devices = deviceRows.filter((device) => device.active7);
  const active30Devices = deviceRows.filter((device) => device.active30);
  const installDevices = deviceRows.filter((device) => device.installEvent);
  const standaloneDevices = deviceRows.filter((device) => device.standalone);

  const nativePushEnabled = nativePushTokens.filter((row: any) => row?.enabled !== false);
  const webPushEnabled = webPushSubscriptions.filter((row: any) => row?.enabled !== false);

  const iosDevices = deviceRows.filter((device) => device.platform === "iOS");
  const webDesktopDevices = deviceRows.filter((device) =>
    ["Web", "Windows", "Mac", "Unknown"].includes(device.platform)
  );
  const androidDevices = deviceRows.filter((device) => device.platform === "Android");

  const installEvents = deviceEvents.filter(isInstallEvent);
  const firstOpenEvents = deviceEvents.filter(
    (event: any) => getEventType(event) === "first_open"
  );
  const pageViewEvents = deviceEvents.filter(
    (event: any) => getEventType(event) === "page_view"
  );

  const events7 = deviceEvents.filter((event: any) =>
    isAfter(event?.created_at, sevenDaysAgo)
  );
  const events30 = deviceEvents.filter((event: any) =>
    isAfter(event?.created_at, thirtyDaysAgo)
  );

  const platformRows = countBy(deviceRows, (device) => device.platform);
  const versionRows = countBy(deviceRows, (device) => device.appVersion);
  const pathRows = countBy(events30, (event: any) => String(event?.path || "/")).slice(0, 10);
  const eventTypeRows = countBy(events30, (event: any) => getEventType(event)).slice(0, 10);

  const monthRows = countBy(
    deviceEvents.filter((event: any) => event?.created_at),
    (event: any) => getMonthKey(event.created_at)
  ).slice(0, 8);

  const dayRows = countBy(
    events30.filter((event: any) => event?.created_at),
    (event: any) => getDayKey(event.created_at)
  ).slice(0, 14);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                Owner Device Analytics
              </p>
              <h1 className="mt-4 text-5xl font-black text-white">
                Installs, Devices & App Usage
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Internal usage analytics for app installs, active devices, platforms, app versions, push-enabled devices, and recent app activity.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/owner/users"
                className="rounded-xl border border-cyan-500 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-500/10"
              >
                👥 Users
              </Link>

              <Link
                href="/dashboard/owner"
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Owner Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Devices" value={String(totalDevices)} helper="Unique devices detected internally." tone="teal" />
          <MetricCard label="Active 7 Days" value={String(active7Devices.length)} helper={`${percent(active7Devices.length, totalDevices)} of all devices.`} tone="green" />
          <MetricCard label="Active 30 Days" value={String(active30Devices.length)} helper={`${percent(active30Devices.length, totalDevices)} of all devices.`} tone="blue" />
          <MetricCard label="Installs / First Opens" value={String(installDevices.length)} helper={`${installEvents.length} install/first-open events.`} tone="purple" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="iOS Devices" value={String(iosDevices.length)} helper={`${percent(iosDevices.length, totalDevices)} of detected devices.`} tone="purple" />
          <MetricCard label="Web/Desktop Devices" value={String(webDesktopDevices.length)} helper={`${percent(webDesktopDevices.length, totalDevices)} of detected devices.`} tone="blue" />
          <MetricCard label="Android Devices" value={String(androidDevices.length)} helper={`${percent(androidDevices.length, totalDevices)} of detected devices.`} tone="green" />
          <MetricCard label="Standalone App Mode" value={String(standaloneDevices.length)} helper="PWA or installed-app style usage." tone="orange" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Native Push Devices" value={String(nativePushEnabled.length)} helper="iOS APNs tokens saved." tone="purple" />
          <MetricCard label="Web Push Devices" value={String(webPushEnabled.length)} helper="Browser push subscriptions saved." tone="teal" />
          <MetricCard label="Events 7 Days" value={String(events7.length)} helper="Internal app/device events." tone="yellow" />
          <MetricCard label="Events 30 Days" value={String(events30.length)} helper="Monthly internal activity events." tone="orange" />
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Panel title="Platform Breakdown" subtitle="Unique detected devices by platform.">
            <StackList rows={platformRows} total={totalDevices} />
          </Panel>

          <Panel title="App Version Adoption" subtitle="Unique detected devices by app version.">
            <StackList rows={versionRows} total={totalDevices} />
          </Panel>

          <Panel title="Event Types" subtitle="Most common internal events in the last 30 days.">
            <StackList rows={eventTypeRows} total={events30.length} />
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Top App Paths" subtitle="Most visited app paths in the last 30 days.">
            <StackList rows={pathRows} total={events30.length} />
          </Panel>

          <Panel title="Daily Activity" subtitle="Internal activity events grouped by day.">
            <StackList rows={dayRows} total={events30.length} />
          </Panel>
        </section>

        <Panel title="Recent Devices" subtitle="Latest unique devices detected by app analytics tracking.">
          <div className="overflow-hidden rounded-2xl border border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-[#020817] text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3 text-right">Events</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Path</th>
                    <th className="px-4 py-3">First Seen</th>
                    <th className="px-4 py-3">Last Seen</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 bg-[#020817]/60">
                  {deviceRows.slice(0, 100).map((device) => (
                    <tr key={device.deviceId} className="hover:bg-slate-900/70">
                      <td className="px-4 py-4">
                        <div className="max-w-[320px]">
                          <p className="truncate font-black text-white">
                            {device.deviceId}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {device.timezone}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <Badge tone={device.platform === "iOS" ? "purple" : "teal"}>
                          {device.platform}
                        </Badge>
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {device.appVersion}
                      </td>

                      <td className="px-4 py-4 text-right font-black text-white">
                        {device.events}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {device.active7 ? (
                            <Badge tone="green">Active 7d</Badge>
                          ) : device.active30 ? (
                            <Badge tone="blue">Active 30d</Badge>
                          ) : (
                            <Badge tone="yellow">Inactive</Badge>
                          )}

                          {device.installEvent && <Badge tone="purple">Install</Badge>}
                          {device.standalone && <Badge tone="orange">App Mode</Badge>}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="block max-w-[260px] truncate text-slate-300">
                          {device.lastPath}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {formatDateTime(device.firstSeen)}
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {formatDateTime(device.lastSeen)}
                      </td>
                    </tr>
                  ))}

                  {deviceRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        No device analytics found yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <section className="rounded-2xl border border-yellow-500/30 bg-yellow-950/10 p-5 text-sm leading-6 text-yellow-100">
          <strong>Important:</strong> These are internal On Point Inspect usage metrics from Supabase. Official App Store download numbers still come from App Store Connect. This page shows devices that opened/used the app after tracking was installed.
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

function StackList({
  rows,
  total,
}: {
  rows: { label: string; count: number }[];
  total: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">
        No data yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = Math.max(4, Math.round((row.count / Math.max(1, total)) * 100));

        return (
          <div key={row.label} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="min-w-0 truncate font-black text-white">{row.label}</p>
              <p className="shrink-0 text-sm font-black text-teal-300">{row.count}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-900">
              <div className="h-full rounded-full bg-teal-400" style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{percent(row.count, total)}</p>
          </div>
        );
      })}
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
