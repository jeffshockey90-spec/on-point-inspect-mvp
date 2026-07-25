
import { formatAppValue, currentLocalDate } from "../../lib/app-time";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import FastLinkButton from "../../components/FastLinkButton";
import FastCard from "../../components/FastCard";
import { OWNER_EMAILS } from "../../lib/ownerEmails";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ownerDashboardCard = {
  title: "Owner Dashboard",
  description:
    "Owner-only system metrics, users, inspectors, reports, revenue, and app growth.",
  href: "/dashboard/owner",
  icon: "👑",
};

const cards = [
  { title: "New Inspection", description: "Start a new inspection.", href: "/inspections/new", icon: "🏠" },
  { title: "Reports", description: "View and edit reports.", href: "/reports", icon: "📋" },
  { title: "Analytics", description: "Track revenue, inspections, payments, agreements, and reports.", href: "/analytics", icon: "📊" },
  { title: "Realtors", description: "Manage realtor contacts, referrals, and revenue.", href: "/realtors", icon: "🏡" },
  { title: "Referral Leaderboard", description: "Rank realtor referrals, revenue, paid inspections, and outstanding balances.", href: "/realtors/leaderboard", icon: "🏆" },
  { title: "Invoices", description: "Track paid, pending, overdue, and outstanding balances.", href: "/invoices", icon: "💰" },
  { title: "Agreements", description: "Manage agreement templates, sending, and signed status.", href: "/agreements", icon: "📝" },
  { title: "Client Portal", description: "Open client portals from reports after selecting an inspection.", href: "/reports", icon: "🔐" },
  { title: "Repair Requests", description: "Open repair requests from reports after selecting an inspection.", href: "/reports", icon: "🛠️" },
  { title: "Radon", description: "Manage radon tests, readings, devices, and results.", href: "/radon", icon: "☢️" },
  { title: "Mold", description: "Track mold samples, lab reports, results, and summaries.", href: "/mold", icon: "🧫" },
  { title: "AI Capture", description: "Create findings from photos.", href: "/ai-capture", icon: "🤖" },
  { title: "Equipment Analyzer", description: "Read data plates and document equipment inventory.", href: "/equipment-analyzer", icon: "🔎" },
  { title: "Field Tool", description: "Mobile AI inspection workflow.", href: "/field", icon: "📱" },
  { title: "Templates", description: "Manage favorite findings, templates, and reusable language.", href: "/templates", icon: "🧩" },
  { title: "Quotes", description: "Calculate pricing.", href: "/quotes", icon: "💲" },
  { title: "Schedule", description: "View inspection schedule.", href: "/schedule", icon: "🗓️" },
  { title: "Public Profile", description: "Manage and share your public inspector marketing page.", href: "/settings#public-profile", icon: "🌐" },
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
        setAll() {},
      },
    }
  );
}

function formatActivityDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatInspectionDate(value: any) {
  if (!value) return "No date set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRelativeTime(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatActivityDate(value);
}

function getViewType(log: any) {
  return String(log?.view_type || "").toLowerCase();
}

function getViewerLabel(log: any) {
  const role = String(log?.viewer_role || "").trim().toLowerCase();
  const viewerEmail = String(log?.viewer_email || "").trim();

  if (viewerEmail) return viewerEmail;
  if (role === "client") return "Client";
  if (role === "realtor" || role === "agent") return "Realtor";
  if (role === "transaction coordinator") return "Transaction Coordinator";
  if (role === "inspector") return "Inspector";

  return "Inspector";
}

function getActivityIcon(log: any) {
  const type = getViewType(log);

  if (type === "client_portal") return "🔐";
  if (type === "report_share") return "📋";
  if (type === "environmental_share") return "🧪";
  if (type === "email_open") return "📬";
  if (type === "email_click") return "👆";
  if (type === "agreement_page") return "📝";
  if (type === "report_time_final" || type === "report_time_checkpoint") return "⏱️";

  return "🔔";
}

function getActivityTitle(log: any) {
  const type = getViewType(log);
  const viewer = getViewerLabel(log);

  if (type === "client_portal") return `${viewer} opened the client portal`;
  if (type === "report_share") return `${viewer} viewed the report`;
  if (type === "environmental_share") return `${viewer} viewed the environmental report`;
  if (type === "email_open") return `${viewer} opened an email`;
  if (type === "email_click") return `${viewer} clicked a report link`;
  if (type === "agreement_page") return `${viewer} opened the agreement page`;
  if (type === "report_time_final") return `${viewer} finished reading the report`;
  if (type === "report_time_checkpoint") return `${viewer} spent time on the report`;

  return `${viewer} activity recorded`;
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
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function isRecentActivity(value: any) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
  return Date.now() - date.getTime() <= sevenDaysMs;
}

function isPublished(inspection: any) {
  return (
    inspection?.published === true ||
    String(inspection?.report_status || "").toLowerCase() === "published"
  );
}

function isTodayInspection(inspection: any) {
  if (!inspection?.inspection_date) return false;

  const today = currentLocalDate();
  return String(inspection.inspection_date).slice(0, 10) === today;
}

function getAddress(inspection: any) {
  return inspection?.property_address || inspection?.address || "Untitled Inspection";
}

function getFirstName(email: string | null | undefined) {
  const clean = String(email || "").trim();
  if (!clean) return "Inspector";

  const name = clean.split("@")[0] || "Inspector";
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[._-].*$/, "");
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const isOwner = OWNER_EMAILS.includes(String(user.email || "").toLowerCase());

  const dashboardCards = isOwner ? [ownerDashboardCard, ...cards] : cards;

  const { data: inspectionsRaw, error: inspectionsError } = await supabase
    .from("inspections")
    .select(
      "id, property_address, address, client_name, realtor_name, inspection_date, created_at, published, report_status"
    )
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  if (inspectionsError) console.error("Dashboard inspections load error:", inspectionsError);

  const inspections = inspectionsRaw || [];
  const inspectionIds = inspections.map((inspection: any) => Number(inspection.id)).filter(Boolean);

  const { data: activityRaw, error: activityError } =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_view_events")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [], error: null };

  if (activityError) console.error("Dashboard activity load error:", activityError);

  const activityLogs = activityRaw || [];
  const inspectionMap = new Map(inspections.map((inspection: any) => [String(inspection.id), inspection]));

  const visibleActivity = activityLogs
    .filter((log: any) =>
      [
        "client_portal",
        "report_share",
        "environmental_share",
        "email_open",
        "email_click",
        "agreement_page",
        "report_time_final",
      ].includes(getViewType(log))
    )
    .slice(0, 8);

  const todayInspections = inspections.filter(isTodayInspection);
  const draftReports = inspections.filter((inspection: any) => !isPublished(inspection));
  const publishedReports = inspections.filter(isPublished);
  const recentActivityCount = activityLogs.filter((log: any) => isRecentActivity(log?.created_at)).length;

  const clientViewedCount = activityLogs.filter(
    (log: any) =>
      getViewType(log) === "client_portal" ||
      (getViewType(log) === "report_share" &&
        String(log?.viewer_role || "").toLowerCase() === "client")
  ).length;

  const realtorViewedCount = activityLogs.filter(
    (log: any) =>
      getViewType(log) === "report_share" &&
      String(log?.viewer_role || "").toLowerCase() === "realtor"
  ).length;

  const emailClickCount = activityLogs.filter((log: any) => getViewType(log) === "email_click").length;

  const totalReadSeconds = activityLogs
    .filter((log: any) => getViewType(log) === "report_time_final")
    .reduce((sum: number, log: any) => sum + getDurationSeconds(log), 0);

  const nextInspection =
    todayInspections[0] ||
    inspections.find((inspection: any) => !isPublished(inspection)) ||
    inspections[0] ||
    null;

  const needsAttentionCount = draftReports.length + todayInspections.length;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-br from-[#0b1220] via-[#071827] to-[#020617] p-6 shadow-2xl shadow-teal-950/30 md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-[#14c8d2]">
                FLOW
              </p>

              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
                Command Center
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                Good day, {getFirstName(user.email)}. Here’s what needs your attention across reports,
                inspections, activity, and delivery.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <FastLinkButton
                  href="/inspections/new"
                  loadingText="Starting..."
                  className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-teal-300"
                >
                  + New Inspection
                </FastLinkButton>

                <FastLinkButton
                  href="/field"
                  loadingText="Opening Field Tool..."
                  className="rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-200 hover:bg-cyan-500/20"
                >
                  📱 Field Tool
                </FastLinkButton>

                <FastLinkButton
                  href="/schedule"
                  loadingText="Opening Schedule..."
                  className="rounded-2xl border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-black text-slate-200 hover:border-teal-400"
                >
                  🗓️ Schedule
                </FastLinkButton>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[430px]">
              <CommandMetric label="Today" value={String(todayInspections.length)} helper="Inspections scheduled today" tone="teal" />
              <CommandMetric label="Drafts" value={String(draftReports.length)} helper="Reports not published yet" tone="yellow" />
              <CommandMetric label="Published" value={String(publishedReports.length)} helper="Reports delivered or ready" tone="green" />
              <CommandMetric label="Activity" value={String(recentActivityCount)} helper="Tracked events this week" tone="cyan" />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
                  Next Up
                </p>

                <h2 className="mt-2 text-3xl font-black text-white">
                  {nextInspection ? getAddress(nextInspection) : "No inspections yet"}
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  {nextInspection
                    ? `${nextInspection.client_name || "No client listed"} • ${formatInspectionDate(
                        nextInspection.inspection_date
                      )}`
                    : "Create your first inspection to get started."}
                </p>
              </div>

              {nextInspection ? (
                <span
                  className={
                    isPublished(nextInspection)
                      ? "rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-300"
                      : "rounded-full border border-yellow-400/50 bg-yellow-500/10 px-4 py-2 text-xs font-black text-yellow-200"
                  }
                >
                  {isPublished(nextInspection) ? "Published" : "Draft"}
                </span>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {nextInspection ? (
                <>
                  <FastLinkButton
                    href={`/reports/${nextInspection.id}`}
                    loadingText="Opening Report..."
                    className="rounded-2xl bg-teal-400 px-5 py-4 text-center text-sm font-black text-slate-950 hover:bg-teal-300"
                  >
                    Continue Report
                  </FastLinkButton>

                  <FastLinkButton
                    href="/field"
                    loadingText="Opening Field Tool..."
                    className="rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-5 py-4 text-center text-sm font-black text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Field Tool
                  </FastLinkButton>

                  <FastLinkButton
                    href="/reports"
                    loadingText="Opening Reports..."
                    className="rounded-2xl border border-slate-700 bg-[#020617] px-5 py-4 text-center text-sm font-black text-slate-200 hover:border-teal-400"
                  >
                    All Reports
                  </FastLinkButton>
                </>
              ) : (
                <FastLinkButton
                  href="/inspections/new"
                  loadingText="Starting..."
                  className="rounded-2xl bg-teal-400 px-5 py-4 text-center text-sm font-black text-slate-950 hover:bg-teal-300 sm:col-span-3"
                >
                  Create Inspection
                </FastLinkButton>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-300">
                  Needs Attention
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">{needsAttentionCount}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Draft reports and today’s inspections are surfaced first so nothing gets buried.
                </p>
              </div>

              <span className="rounded-2xl bg-yellow-500/10 p-4 text-3xl">⚡</span>
            </div>

            <div className="mt-5 space-y-3">
              {draftReports.slice(0, 3).map((inspection: any) => (
                <FastLinkButton
                  key={inspection.id}
                  href={`/reports/${inspection.id}`}
                  loadingText="Opening..."
                  className="block rounded-2xl border border-slate-700 bg-[#020617]/80 p-4 text-left hover:border-yellow-400/70"
                >
                  <p className="font-black text-white">{getAddress(inspection)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Draft report • {inspection.client_name || "No client listed"}
                  </p>
                </FastLinkButton>
              ))}

              {draftReports.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-[#020617]/70 p-5 text-sm text-slate-400">
                  No draft reports needing attention.
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <ActivityMetric label="Client Views" value={String(clientViewedCount)} helper="Client portal or client report opens." />
          <ActivityMetric label="Realtor Views" value={String(realtorViewedCount)} helper="Realtor report opens from tracked links." />
          <ActivityMetric label="Email Clicks" value={String(emailClickCount)} helper="Tracked report link clicks." />
          <ActivityMetric label="Read Time" value={formatDuration(totalReadSeconds)} helper="Completed report reading sessions." />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-teal-300">Recent Activity</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Report views, client portal opens, email clicks, and read time.
                </p>
              </div>

              <FastLinkButton
                href="/analytics"
                className="rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-black text-teal-300 hover:bg-teal-500 hover:text-slate-950"
              >
                Analytics
              </FastLinkButton>
            </div>

            <div className="mt-6 space-y-3">
              {visibleActivity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-[#020617]/70 p-6 text-center text-sm text-slate-400">
                  No tracked client or realtor activity yet.
                </div>
              ) : (
                visibleActivity.map((log: any) => {
                  const inspection = inspectionMap.get(String(log.inspection_id_bigint || log.inspection_id || ""));
                  const address = inspection?.property_address || inspection?.address || "Unknown inspection";

                  return (
                    <FastLinkButton
                      key={log.id || `${log.created_at}-${log.view_type}`}
                      href={`/reports/${log.inspection_id_bigint || log.inspection_id}`}
                      className="block w-full rounded-xl border border-slate-700 bg-[#020617]/70 p-4 text-left hover:border-teal-500/70"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl">
                          {getActivityIcon(log)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-black text-white">{getActivityTitle(log)}</p>
                            <p className="text-xs font-bold text-slate-500">{getRelativeTime(log.created_at)}</p>
                          </div>

                          <p className="mt-1 truncate text-sm text-slate-400">{address}</p>

                          {getDurationSeconds(log) > 0 ? (
                            <p className="mt-1 text-xs text-teal-300">
                              Read time: {formatDuration(getDurationSeconds(log))}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </FastLinkButton>
                  );
                })
              )}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {dashboardCards.map((card) => (
              <FastCard
                key={card.href + card.title}
                href={card.href}
                icon={card.icon}
                title={card.title}
                description={card.description}
                loadingText={`Opening ${card.title}...`}
              />
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

function CommandMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "teal" | "yellow" | "green" | "cyan";
}) {
  const classes = {
    teal: "border-teal-400/40 bg-teal-500/10 text-teal-200",
    yellow: "border-yellow-400/40 bg-yellow-500/10 text-yellow-100",
    green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    cyan: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-xl ${classes[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{helper}</p>
    </div>
  );
}

function ActivityMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl transition duration-150 active:scale-[0.985]">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-400">{helper}</p>
    </div>
  );
}