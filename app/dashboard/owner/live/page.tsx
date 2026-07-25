import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

import { formatAppValue } from "../../../../lib/app-time";

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;



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

  return formatAppValue(date, {
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
        <p className="mt-4 text-slate-300">This owner tool is only available to the FLOW owner account.</p>
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

function getViewType(event: any) {
  return String(event?.view_type || event?.event_type || "").toLowerCase();
}

function getActivityTitle(event: any) {
  const type = getViewType(event);
  const email = event?.viewer_email || event?.user_email || "";
  const viewer = email || event?.viewer_role || "Viewer";

  if (type === "client_portal") return `${viewer} opened client portal`;
  if (type === "report_share") return `${viewer} viewed report`;
  if (type === "environmental_share") return `${viewer} viewed environmental report`;
  if (type === "email_open") return `${viewer} opened email`;
  if (type === "email_click") return `${viewer} clicked report link`;
  if (type === "agreement_page") return `${viewer} opened agreement`;
  if (type === "agreement_signed") return `${viewer} signed agreement`;
  if (type === "payment_received") return "Payment received";
  if (type === "report_time_final") return `${viewer} finished reading report`;
  if (type === "review_submitted") return "Review submitted";

  return `${viewer} activity`;
}

function getActivityIcon(event: any) {
  const type = getViewType(event);

  if (type === "client_portal") return "🔐";
  if (type === "report_share") return "📋";
  if (type === "environmental_share") return "🧪";
  if (type === "email_open") return "📬";
  if (type === "email_click") return "👆";
  if (type === "agreement_page") return "📝";
  if (type === "agreement_signed") return "✅";
  if (type === "payment_received") return "💰";
  if (type === "report_time_final") return "⏱️";
  if (type === "review_submitted") return "⭐";

  return "🔔";
}

export default async function OwnerLiveActivityPage() {
  const owner = await requireOwner();

  if (!owner) return <RestrictedOwner />;

  const admin = createAdminClient();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);

  const [events, inspections, deviceEvents] = await Promise.all([
    safeSelect(admin.from("inspection_view_events").select("*").order("created_at", { ascending: false }).limit(500), "inspection_view_events"),
    safeSelect(admin.from("inspections").select("id,address,property_address,client_name,realtor_name").limit(2000), "inspections"),
    safeSelect(admin.from("app_device_events").select("*").order("created_at", { ascending: false }).limit(500), "app_device_events"),
  ]);

  const inspectionMap = new Map<string, any>();
  inspections.forEach((inspection: any) => inspectionMap.set(String(inspection.id), inspection));

  const events24 = events.filter((event: any) => isAfter(event?.created_at, oneDayAgo));
  const events7 = events.filter((event: any) => isAfter(event?.created_at, sevenDaysAgo));
  const signed = events.filter((event: any) => getViewType(event) === "agreement_signed");
  const payments = events.filter((event: any) => getViewType(event) === "payment_received");
  const views = events.filter((event: any) => ["client_portal", "report_share", "environmental_share"].includes(getViewType(event)));

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-blue-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-400">Owner Live Activity Center</p>
              <h1 className="mt-4 text-5xl font-black text-white">Real-Time Business Activity</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Monitor report views, agreement signatures, payments, email clicks, reviews, and app activity.
              </p>
            </div>
            <OwnerNav />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Activity 24h" value={String(events24.length)} helper="Report/client events in the last day." tone="blue" />
          <MetricCard label="Activity 7d" value={String(events7.length)} helper="Report/client events this week." tone="teal" />
          <MetricCard label="Agreements Signed" value={String(signed.length)} helper="Agreement signature events." tone="green" />
          <MetricCard label="Payments Received" value={String(payments.length)} helper="Payment activity events." tone="green" />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Report Views" value={String(views.length)} helper="Client portal/share/environmental views." tone="purple" />
          <MetricCard label="App Events" value={String(deviceEvents.length)} helper="Recent device/app analytics events." tone="orange" />
          <MetricCard label="Total Live Events" value={String(events.length)} helper="Latest loaded activity records." tone="yellow" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Live Report Activity" subtitle="Newest client, realtor, report, agreement, and payment activity.">
            {events.length === 0 ? (
              <EmptyState text="No live report activity yet." />
            ) : (
              <div className="space-y-3">
                {events.slice(0, 80).map((event: any, index: number) => {
                  const inspectionId = String(event?.inspection_id_bigint || event?.inspection_id || "");
                  const inspection = inspectionMap.get(inspectionId);
                  const address = inspection?.property_address || inspection?.address || (inspectionId ? `Inspection #${inspectionId}` : "Unknown inspection");

                  return (
                    <div key={event?.id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-black text-white">
                            <span className="mr-2">{getActivityIcon(event)}</span>
                            {getActivityTitle(event)}
                          </p>
                          <p className="mt-1 text-sm text-slate-400">{address}</p>
                          {event?.viewer_email && <p className="mt-1 text-xs text-slate-500">{event.viewer_email}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-500">{formatDateTime(event?.created_at)}</p>
                          <p className="mt-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-black text-blue-300">{getViewType(event) || "activity"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Recent App Events" subtitle="App/device activity from usage tracking.">
            {deviceEvents.length === 0 ? (
              <EmptyState text="No app events yet." />
            ) : (
              <div className="space-y-3">
                {deviceEvents.slice(0, 40).map((event: any, index: number) => (
                  <div key={event?.id || index} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{event?.event_type || "app_event"}</p>
                        <p className="mt-1 truncate text-sm text-slate-400">{event?.path || "/"}</p>
                      </div>
                      <p className="shrink-0 text-xs text-slate-500">{formatDateTime(event?.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}
