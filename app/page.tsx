import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cards = [
  {
    title: "New Inspection",
    description: "Start a new inspection.",
    href: "/inspections/new",
    icon: "🏠",
  },
  {
    title: "Reports",
    description: "View and edit reports.",
    href: "/reports",
    icon: "📋",
  },
  {
    title: "Analytics",
    description:
      "Track revenue, inspections, payments, agreements, and reports.",
    href: "/analytics",
    icon: "📊",
  },
  {
    title: "Realtors",
    description: "Manage realtor contacts, referrals, and revenue.",
    href: "/realtors",
    icon: "🏡",
  },
  {
    title: "Referral Leaderboard",
    description:
      "Rank realtor referrals, revenue, paid inspections, and outstanding balances.",
    href: "/realtors/leaderboard",
    icon: "🏆",
  },
  {
    title: "Invoices",
    description:
      "Track paid, pending, overdue, and outstanding balances.",
    href: "/invoices",
    icon: "💰",
  },
  {
    title: "Agreements",
    description:
      "Manage agreement templates, sending, and signed status.",
    href: "/agreements",
    icon: "📝",
  },
  {
    title: "Client Portal",
    description:
      "Open client portals from reports after selecting an inspection.",
    href: "/reports",
    icon: "🔐",
  },
  {
    title: "Repair Requests",
    description:
      "Open repair requests from reports after selecting an inspection.",
    href: "/reports",
    icon: "🛠️",
  },
  {
    title: "Radon",
    description: "Manage radon tests, readings, devices, and results.",
    href: "/radon",
    icon: "☢️",
  },
  {
    title: "Mold",
    description: "Track mold samples, lab reports, results, and summaries.",
    href: "/mold",
    icon: "🧫",
  },
  {
    title: "AI Capture",
    description: "Create findings from photos.",
    href: "/ai-capture",
    icon: "🤖",
  },
  {
    title: "Equipment Analyzer",
    description:
      "Read data plates and document equipment inventory.",
    href: "/equipment-analyzer",
    icon: "🔎",
  },
  {
    title: "Field Tool",
    description: "Mobile AI inspection workflow.",
    href: "/field",
    icon: "📱",
  },
  {
    title: "Templates",
    description:
      "Manage favorite findings, templates, and reusable language.",
    href: "/templates",
    icon: "🧩",
  },
  {
    title: "Quotes",
    description: "Calculate pricing.",
    href: "/quotes",
    icon: "💲",
  },
  {
    title: "Schedule",
    description: "View inspection schedule.",
    href: "/schedule",
    icon: "🗓️",
  },
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

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

  // Anonymous report/share views created during logged-in testing are most often the inspector.
  // This avoids showing "Someone" for your own dashboard testing.
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

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspectionsRaw, error: inspectionsError } = await supabase
    .from("inspections")
    .select("id, property_address, address, client_name, realtor_name, created_at")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  if (inspectionsError) {
    console.error("Dashboard inspections load error:", inspectionsError);
  }

  const inspections = inspectionsRaw || [];
  const inspectionIds = inspections
    .map((inspection: any) => Number(inspection.id))
    .filter(Boolean);

  const { data: activityRaw, error: activityError } =
    inspectionIds.length > 0
      ? await supabase
          .from("inspection_view_events")
          .select("*")
          .in("inspection_id_bigint", inspectionIds)
          .order("created_at", { ascending: false })
          .limit(30)
      : { data: [], error: null };

  if (activityError) {
    console.error("Dashboard activity load error:", activityError);
  }

  const activityLogs = activityRaw || [];

  const inspectionMap = new Map(
    inspections.map((inspection: any) => [String(inspection.id), inspection])
  );

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

  const recentActivityCount = activityLogs.filter((log: any) =>
    isRecentActivity(log?.created_at)
  ).length;

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

  const emailClickCount = activityLogs.filter(
    (log: any) => getViewType(log) === "email_click"
  ).length;

  const totalReadSeconds = activityLogs
    .filter((log: any) => getViewType(log) === "report_time_final")
    .reduce((sum: number, log: any) => sum + getDurationSeconds(log), 0);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-8 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.4em] text-teal-400">
                On Point Home Inspections
              </p>

              <h1 className="text-5xl font-extrabold">
                Inspection Dashboard
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Manage inspections, reports, AI findings, analytics, invoices,
                realtor contacts, referral leaderboard, agreements, client portals,
                repair requests, radon, mold, templates, quotes, and scheduling
                from one clean dashboard.
              </p>
            </div>

            <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-5 py-4 text-center shadow-lg">
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl">🔔</span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                    Activity
                  </p>
                  <p className="text-3xl font-black text-white">
                    {recentActivityCount}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Events in the last 7 days
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <ActivityMetric
            label="Client Views"
            value={String(clientViewedCount)}
            helper="Client portal or client report opens."
          />

          <ActivityMetric
            label="Realtor Views"
            value={String(realtorViewedCount)}
            helper="Realtor report opens from tracked links."
          />

          <ActivityMetric
            label="Email Clicks"
            value={String(emailClickCount)}
            helper="Tracked report link clicks."
          />

          <ActivityMetric
            label="Read Time"
            value={formatDuration(totalReadSeconds)}
            helper="Completed report reading sessions."
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-teal-300">
                  Recent Activity
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Report views, client portal opens, email clicks, and read time.
                </p>
              </div>

              <Link
                href="/analytics"
                className="rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-black text-teal-300 transition hover:bg-teal-500 hover:text-slate-950"
              >
                Analytics
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {visibleActivity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-[#020617]/70 p-6 text-center text-sm text-slate-400">
                  No tracked client or realtor activity yet.
                </div>
              ) : (
                visibleActivity.map((log: any) => {
                  const inspection = inspectionMap.get(
                    String(log.inspection_id_bigint || log.inspection_id || "")
                  );

                  const address =
                    inspection?.property_address ||
                    inspection?.address ||
                    "Unknown inspection";

                  return (
                    <Link
                      key={log.id || `${log.created_at}-${log.view_type}`}
                      href={`/reports/${log.inspection_id_bigint || log.inspection_id}`}
                      className="block rounded-xl border border-slate-700 bg-[#020617]/70 p-4 transition hover:border-teal-500/70"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl">
                          {getActivityIcon(log)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-black text-white">
                              {getActivityTitle(log)}
                            </p>

                            <p className="text-xs font-bold text-slate-500">
                              {getRelativeTime(log.created_at)}
                            </p>
                          </div>

                          <p className="mt-1 truncate text-sm text-slate-400">
                            {address}
                          </p>

                          {getDurationSeconds(log) > 0 && (
                            <p className="mt-1 text-xs text-teal-300">
                              Read time: {formatDuration(getDurationSeconds(log))}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link
                key={card.href + card.title}
                href={card.href}
                className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-lg transition hover:-translate-y-0.5 hover:border-teal-500 hover:bg-[#13213a]"
              >
                <div className="mb-5 text-4xl">
                  {card.icon}
                </div>

                <h2 className="text-2xl font-bold text-white group-hover:text-teal-300">
                  {card.title}
                </h2>

                <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-400">
                  {card.description}
                </p>

                <p className="mt-5 font-bold text-teal-400">
                  Open →
                </p>
              </Link>
            ))}
          </section>
        </section>
      </div>
    </main>
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
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black text-white">
        {value}
      </p>

      <p className="mt-2 text-sm leading-5 text-slate-400">
        {helper}
      </p>
    </div>
  );
}
