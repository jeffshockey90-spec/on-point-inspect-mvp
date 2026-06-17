
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import OwnerAccountActions from "../../../../components/OwnerAccountActions";
import OwnerInspectorBillingControls from "../../../../components/OwnerInspectorBillingControls";

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

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "white" | Tone }) {
  const valueClass: Record<"white" | Tone, string> = {
    white: "text-white",
    teal: "text-teal-300",
    green: "text-green-300",
    blue: "text-blue-300",
    purple: "text-purple-300",
    orange: "text-orange-300",
    yellow: "text-yellow-300",
    red: "text-red-300",
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${valueClass[tone]}`}>{value}</p>
    </div>
  );
}

export default async function OwnerInspectorsPage() {
  const owner = await requireOwner();

  if (!owner) return <RestrictedOwner />;

  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

  const [profiles, inspectorProfiles, companyUsers, inspections, nativeTokens, webSubscriptions, deviceEvents] = await Promise.all([
    safeSelect(admin.from("profiles").select("*"), "profiles"),
    safeSelect(admin.from("inspector_profiles").select("*"), "inspector_profiles"),
    safeSelect(admin.from("company_users").select("*"), "company_users"),
    safeSelect(admin.from("inspections").select("*"), "inspections"),
    safeSelect(admin.from("app_native_push_tokens").select("*"), "app_native_push_tokens"),
    safeSelect(admin.from("app_push_subscriptions").select("*"), "app_push_subscriptions"),
    safeSelect(admin.from("app_device_events").select("*").order("created_at", { ascending: false }).limit(2000), "app_device_events"),
  ]);

  const users = new Map<string, any>();

  [...profiles, ...companyUsers].forEach((row: any) => {
    const id = getUserKey(row);
    if (!id) return;
    users.set(id, { ...row, id, name: getUserName(row), email: getUserEmail(row), role: getUserRole(row) });
  });

  inspectorProfiles.forEach((row: any) => {
    const id = String(row?.inspector_id || row?.id || "");
    if (!id) return;
    users.set(id, { ...(users.get(id) || {}), ...row, id, name: getUserName(row), email: getUserEmail(row), role: "inspector" });
  });

  inspections.forEach((inspection: any) => {
    const id = getInspectorId(inspection);
    if (!id) return;
    if (!users.has(id)) users.set(id, { id, name: "Inspector", email: "", role: "inspector" });
  });

  const rows = [...users.values()]
    .filter((row: any) => String(row?.role || "").includes("inspector") || inspections.some((inspection: any) => getInspectorId(inspection) === row.id))
    .map((row: any) => {
      const inspectorInspections = inspections.filter((inspection: any) => getInspectorId(inspection) === row.id && inspection?.is_demo !== true);
      const reports7 = inspectorInspections.filter((inspection: any) => isAfter(inspection?.created_at || inspection?.inspection_date, sevenDaysAgo));
      const reports30 = inspectorInspections.filter((inspection: any) => isAfter(inspection?.created_at || inspection?.inspection_date, thirtyDaysAgo));
      const revenue = inspectorInspections.reduce((sum: number, inspection: any) => sum + getInspectionRevenue(inspection), 0);
      const latestReport = inspectorInspections
        .map((inspection: any) => inspection?.created_at || inspection?.inspection_date)
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
      const latestDevice = deviceEvents.find((event: any) => {
        const email = String(event?.user_email || event?.metadata?.user_email || "").toLowerCase();
        const userId = String(event?.user_id || event?.metadata?.user_id || "");
        return (row.email && email === String(row.email).toLowerCase()) || userId === row.id;
      });

      const nativePush = nativeTokens.some((token: any) => token?.enabled !== false && (String(token?.user_id || "") === row.id || String(token?.user_email || "").toLowerCase() === String(row.email || "").toLowerCase()));
      const webPush = webSubscriptions.some((sub: any) => sub?.enabled !== false && (String(sub?.user_id || "") === row.id || String(sub?.user_email || "").toLowerCase() === String(row.email || "").toLowerCase()));

      return {
        id: row.id,
        name: row.name || "Inspector",
        email: row.email || "",
        reports: inspectorInspections.length,
        reports7: reports7.length,
        reports30: reports30.length,
        revenue,
        average: inspectorInspections.length > 0 ? Math.round(revenue / Math.max(1, inspectorInspections.filter(isPaidInspection).length)) : 0,
        latestReport,
        lastActivity: latestDevice?.created_at || latestReport,
        nativePush,
        webPush,
        active30: isAfter(latestDevice?.created_at || latestReport, thirtyDaysAgo),
        subscriptionStatus: row.subscription_status,
        subscriptionRequired: row.subscription_required,
        subscriptionExempt: row.subscription_exempt,
        subscriptionExemptReason: row.subscription_exempt_reason,
        subscriptionPriceOverrideCents: row.subscription_price_override_cents,
        subscriptionPriceOverrideReason: row.subscription_price_override_reason,
        freeInspectionLimit: row.free_inspection_limit,
        freeInspectionsUsed: row.free_inspections_used ?? inspectorInspections.length,
        foundingMember: row.founding_member,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.reports30 - a.reports30 || b.reports - a.reports);

  const active30 = rows.filter((row) => row.active30);
  const pushEnabled = rows.filter((row) => row.nativePush || row.webPush);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalReports = rows.reduce((sum, row) => sum + row.reports, 0);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-orange-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-400">Owner Inspector Management</p>
              <h1 className="mt-4 text-5xl font-black text-white">Inspectors, Production & Activity</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Track inspector activity, report production, revenue, push setup, and recent usage.
              </p>
            </div>
            <OwnerNav />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Inspectors" value={String(rows.length)} helper="Inspector users and users with report activity." tone="orange" />
          <MetricCard label="Active 30 Days" value={String(active30.length)} helper="Inspectors with recent report/device activity." tone="green" />
          <MetricCard label="Reports" value={String(totalReports)} helper="Live reports created by inspectors." tone="blue" />
          <MetricCard label="Revenue" value={money(totalRevenue)} helper="Paid report revenue attributed to inspectors." tone="green" />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Push Enabled" value={String(pushEnabled.length)} helper="Inspectors with native or web push enabled." tone="purple" />
          <MetricCard label="Reports 7 Days" value={String(rows.reduce((sum, row) => sum + row.reports7, 0))} helper="Recent weekly report production." tone="teal" />
          <MetricCard label="Reports 30 Days" value={String(rows.reduce((sum, row) => sum + row.reports30, 0))} helper="Monthly report production." tone="blue" />
        </section>

        <Panel title="Inspector Management" subtitle="Inspector production, billing controls, push status, and account actions.">
          {rows.length === 0 ? (
            <EmptyState text="No inspectors found yet." />
          ) : (
            <div className="space-y-5">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-slate-700 bg-[#020817]/70 p-5 shadow-xl"
                >
                  <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr_1fr]">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Inspector
                        </p>
                        <h3 className="mt-1 text-2xl font-black text-white">{row.name}</h3>
                        <p className="mt-1 break-all text-sm text-slate-400">{row.email || "No email"}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <MiniStat label="Reports" value={String(row.reports)} tone="white" />
                        <MiniStat label="7 Days" value={String(row.reports7)} tone="teal" />
                        <MiniStat label="30 Days" value={String(row.reports30)} tone="blue" />
                        <MiniStat label="Revenue" value={money(row.revenue)} tone="green" />
                        <MiniStat label="Average" value={money(row.average)} tone="orange" />
                        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Push</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.nativePush && <Badge tone="purple">Native</Badge>}
                            {row.webPush && <Badge tone="teal">Web</Badge>}
                            {!row.nativePush && !row.webPush && <Badge tone="red">Off</Badge>}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          Last Activity
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-200">{formatDateTime(row.lastActivity)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                      <OwnerInspectorBillingControls
                        userId={row.id}
                        email={row.email}
                        subscriptionStatus={row.subscriptionStatus}
                        subscriptionRequired={row.subscriptionRequired}
                        subscriptionExempt={row.subscriptionExempt}
                        subscriptionExemptReason={row.subscriptionExemptReason}
                        subscriptionPriceOverrideCents={row.subscriptionPriceOverrideCents}
                        subscriptionPriceOverrideReason={row.subscriptionPriceOverrideReason}
                        freeInspectionLimit={row.freeInspectionLimit}
                        freeInspectionsUsed={row.freeInspectionsUsed}
                        foundingMember={row.foundingMember}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">
                        Account Actions
                      </p>
                      <OwnerAccountActions userId={row.id} email={row.email} currentRole="inspector" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
