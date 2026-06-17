
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

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

async function requireOwner() {
  const userClient = await createUserClient();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) redirect("/login");

  const email = String(user.email || "").toLowerCase();

  if (!OWNER_EMAILS.includes(email)) {
    return null;
  }

  return user;
}

async function safeSelect<T = any>(
  query: PromiseLike<{ data: T | null; error: any }>,
  label: string
) {
  try {
    const { data, error } = await query;

    if (error) {
      console.error(`Owner suite ${label} error:`, error);
      return [] as any[];
    }

    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner suite ${label} exception:`, error);
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

function isAfter(value: any, compareDate: Date) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date >= compareDate;
}

function getUserEmail(row: any) {
  return String(row?.email || row?.user_email || row?.owner_email || row?.auth_email || "").toLowerCase();
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
  return String(row?.role || row?.account_type || row?.user_role || (row?.inspector_id ? "inspector" : "") || "user").toLowerCase();
}

function getUserKey(row: any) {
  return String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || getUserEmail(row) || "");
}

function getInspectorId(inspection: any) {
  return String(inspection?.inspector_id || inspection?.user_id || "");
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

function getPaidAmount(inspection: any) {
  return getNumber(inspection?.amount_paid) || getNumber(inspection?.paid_amount) || 0;
}

function isPaidInspection(inspection: any) {
  const status = String(inspection?.payment_status || inspection?.invoice_status || inspection?.status || "").toLowerCase();

  if (status === "paid" || status === "waived" || status === "complete" || status === "completed") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);

  return price > 0 && paid >= price;
}

function getInspectionRevenue(inspection: any) {
  if (!isPaidInspection(inspection)) return 0;
  return getPaidAmount(inspection) || getInspectionPrice(inspection);
}

function RestrictedOwner() {
  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8 shadow-2xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-red-300">Owner Only</p>
        <h1 className="mt-4 text-4xl font-black">Access Restricted</h1>
        <p className="mt-4 text-slate-300">This owner tool is only available to the On Point Inspect owner account.</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-black text-red-300 hover:bg-red-500/10">
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}

function OwnerNav() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/dashboard/owner" className="rounded-xl border border-teal-500 px-4 py-3 font-black text-teal-300 transition hover:bg-teal-500/10">
        Owner
      </Link>
      <Link href="/dashboard/owner/users" className="rounded-xl border border-cyan-500 px-4 py-3 font-black text-cyan-300 transition hover:bg-cyan-500/10">
        👥 Users
      </Link>
      <Link href="/dashboard/owner/devices" className="rounded-xl border border-purple-500 px-4 py-3 font-black text-purple-300 transition hover:bg-purple-500/10">
        📱 Devices
      </Link>
      <Link href="/dashboard/owner/revenue" className="rounded-xl border border-green-500 px-4 py-3 font-black text-green-300 transition hover:bg-green-500/10">
        💰 Revenue
      </Link>
      <Link href="/dashboard/owner/push" className="rounded-xl border border-yellow-500 px-4 py-3 font-black text-yellow-300 transition hover:bg-yellow-500/10">
        🔔 Push Center
      </Link>
      <Link href="/dashboard/owner/inspectors" className="rounded-xl border border-orange-500 px-4 py-3 font-black text-orange-300 transition hover:bg-orange-500/10">
        🧑‍ inspector
      </Link>
      <Link href="/dashboard/owner/live" className="rounded-xl border border-blue-500 px-4 py-3 font-black text-blue-300 transition hover:bg-blue-500/10">
        ⚡ Live
      </Link>
      <Link href="/dashboard/owner/system" className="rounded-xl border border-slate-500 px-4 py-3 font-black text-slate-200 transition hover:bg-slate-700/30">
        🩺 System
      </Link>
    </div>
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

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    green: "border-green-500/30 bg-green-500/10 text-green-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
  };

  return <span className={`rounded-full border px-2 py-1 text-xs font-black ${classes[tone]}`}>{children}</span>;
}

function healthStatus(ok: boolean) {
  return ok ? "Ready" : "Missing";
}

export default async function OwnerSystemHealthPage() {
  const owner = await requireOwner();

  if (!owner) return <RestrictedOwner />;

  const admin = createAdminClient();

  const [
    inspections,
    profiles,
    nativeTokens,
    webSubscriptions,
    deviceEvents,
    liveEvents,
    invoices,
  ] = await Promise.all([
    safeSelect(admin.from("inspections").select("id").limit(5), "inspections"),
    safeSelect(admin.from("profiles").select("id").limit(5), "profiles"),
    safeSelect(admin.from("app_native_push_tokens").select("*").limit(50), "app_native_push_tokens"),
    safeSelect(admin.from("app_push_subscriptions").select("*").limit(50), "app_push_subscriptions"),
    safeSelect(admin.from("app_device_events").select("*").order("created_at", { ascending: false }).limit(100), "app_device_events"),
    safeSelect(admin.from("inspection_view_events").select("*").order("created_at", { ascending: false }).limit(100), "inspection_view_events"),
    safeSelect(admin.from("invoices").select("id").limit(5), "invoices"),
  ]);

  const checks = [
    {
      name: "Supabase URL",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      details: "NEXT_PUBLIC_SUPABASE_URL",
    },
    {
      name: "Supabase Service Role",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      details: "SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      name: "OpenAI",
      ok: Boolean(process.env.OPENAI_API_KEY),
      details: "OPENAI_API_KEY",
    },
    {
      name: "Stripe",
      ok: Boolean(process.env.STRIPE_SECRET_KEY),
      details: "STRIPE_SECRET_KEY",
    },
    {
      name: "VAPID Public",
      ok: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      details: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    },
    {
      name: "VAPID Private",
      ok: Boolean(process.env.VAPID_PRIVATE_KEY),
      details: "VAPID_PRIVATE_KEY",
    },
    {
      name: "Apple Team ID",
      ok: Boolean(process.env.APPLE_TEAM_ID),
      details: "APPLE_TEAM_ID",
    },
    {
      name: "Apple APNs Key ID",
      ok: Boolean(process.env.APPLE_APNS_KEY_ID),
      details: "APPLE_APNS_KEY_ID",
    },
    {
      name: "Apple APNs Private Key",
      ok: Boolean(process.env.APPLE_APNS_PRIVATE_KEY),
      details: "APPLE_APNS_PRIVATE_KEY",
    },
    {
      name: "Apple Bundle ID",
      ok: Boolean(process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID),
      details: "APPLE_BUNDLE_ID / NEXT_PUBLIC_IOS_BUNDLE_ID",
    },
  ];

  const readyChecks = checks.filter((check) => check.ok).length;
  const missingChecks = checks.length - readyChecks;
  const nativeEnabled = nativeTokens.filter((row: any) => row?.enabled !== false);
  const webEnabled = webSubscriptions.filter((row: any) => row?.enabled !== false);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-slate-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-slate-300">Owner System Health</p>
              <h1 className="mt-4 text-5xl font-black text-white">Services, Tables & Configuration</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Owner-only checklist for environment keys, database connectivity, push notification readiness, and system activity.
              </p>
            </div>
            <OwnerNav />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Ready Checks" value={String(readyChecks)} helper={`${checks.length} configuration checks total.`} tone="green" />
          <MetricCard label="Missing Checks" value={String(missingChecks)} helper="Missing env vars or setup items." tone={missingChecks > 0 ? "red" : "green"} />
          <MetricCard label="Native Push Tokens" value={String(nativeEnabled.length)} helper="Enabled APNs tokens." tone="purple" />
          <MetricCard label="Web Push Subs" value={String(webEnabled.length)} helper="Enabled browser push subscriptions." tone="teal" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Inspections Table" value={String(inspections.length)} helper="Connectivity sample rows." tone="blue" />
          <MetricCard label="Profiles Table" value={String(profiles.length)} helper="Connectivity sample rows." tone="blue" />
          <MetricCard label="Device Events" value={String(deviceEvents.length)} helper="Recent app tracking rows." tone="orange" />
          <MetricCard label="Live Events" value={String(liveEvents.length)} helper="Recent report activity rows." tone="yellow" />
        </section>

        <Panel title="Configuration Checks" subtitle="Missing items should be added in Vercel environment variables or app setup.">
          <div className="grid gap-4 md:grid-cols-2">
            {checks.map((check) => (
              <div key={check.name} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-white">{check.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{check.details}</p>
                  </div>
                  <Badge tone={check.ok ? "green" : "red"}>{healthStatus(check.ok)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent System Events" subtitle="Latest device and live activity rows.">
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 font-black text-teal-300">App Device Events</h3>
              <div className="space-y-3">
                {deviceEvents.slice(0, 20).map((event: any, index: number) => (
                  <div key={event?.id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <p className="font-black text-white">{event?.event_type || "event"}</p>
                    <p className="mt-1 text-sm text-slate-400">{event?.path || "/"}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event?.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-black text-blue-300">Inspection View Events</h3>
              <div className="space-y-3">
                {liveEvents.slice(0, 20).map((event: any, index: number) => (
                  <div key={event?.id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <p className="font-black text-white">{event?.view_type || event?.event_type || "activity"}</p>
                    <p className="mt-1 text-sm text-slate-400">Inspection #{event?.inspection_id_bigint || event?.inspection_id || "N/A"}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event?.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
