
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import OwnerPushNotificationCenter from "../../../../components/OwnerPushNotificationCenter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

type PushUser = {
  id: string;
  label: string;
  email: string;
  role: string;
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
      console.error(`Owner push ${label} error:`, error);
      return [] as any[];
    }

    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner push ${label} exception:`, error);
    return [] as any[];
  }
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

function RestrictedOwner() {
  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8 shadow-2xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-red-300">
          Owner Only
        </p>
        <h1 className="mt-4 text-4xl font-black">Access Restricted</h1>
        <p className="mt-4 text-slate-300">
          This owner tool is only available to the FLOW owner account.
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

function OwnerNav() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/dashboard/owner"
        className="rounded-xl border border-teal-500 px-4 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
      >
        Owner
      </Link>
      <Link
        href="/dashboard/owner/users"
        className="rounded-xl border border-cyan-500 px-4 py-3 font-black text-cyan-300 transition hover:bg-cyan-500/10"
      >
        👥 Users
      </Link>
      <Link
        href="/dashboard/owner/devices"
        className="rounded-xl border border-purple-500 px-4 py-3 font-black text-purple-300 transition hover:bg-purple-500/10"
      >
        📱 Devices
      </Link>
      <Link
        href="/dashboard/owner/revenue"
        className="rounded-xl border border-green-500 px-4 py-3 font-black text-green-300 transition hover:bg-green-500/10"
      >
        💰 Revenue
      </Link>
      <Link
        href="/dashboard/owner/push"
        className="rounded-xl border border-yellow-500 px-4 py-3 font-black text-yellow-300 transition hover:bg-yellow-500/10"
      >
        🔔 Push Center
      </Link>
      <Link
        href="/dashboard/owner/inspectors"
        className="rounded-xl border border-orange-500 px-4 py-3 font-black text-orange-300 transition hover:bg-orange-500/10"
      >
        🧑‍🔧 Inspectors
      </Link>
      <Link
        href="/dashboard/owner/live"
        className="rounded-xl border border-blue-500 px-4 py-3 font-black text-blue-300 transition hover:bg-blue-500/10"
      >
        ⚡ Live
      </Link>
      <Link
        href="/dashboard/owner/system"
        className="rounded-xl border border-slate-500 px-4 py-3 font-black text-slate-200 transition hover:bg-slate-700/30"
      >
        🩺 System
      </Link>
    </div>
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

export default async function OwnerPushPage() {
  const owner = await requireOwner();

  if (!owner) return <RestrictedOwner />;

  const admin = createAdminClient();

  const [profiles, companyUsers, nativeTokens, webSubscriptions, events] =
    await Promise.all([
      safeSelect(
        admin.from("profiles").select("*").order("created_at", {
          ascending: false,
        }),
        "profiles"
      ),
      safeSelect(
        admin.from("company_users").select("*").order("created_at", {
          ascending: false,
        }),
        "company_users"
      ),
      safeSelect(
        admin.from("app_native_push_tokens").select("*").order("updated_at", {
          ascending: false,
        }),
        "app_native_push_tokens"
      ),
      safeSelect(
        admin.from("app_push_subscriptions").select("*").order("updated_at", {
          ascending: false,
        }),
        "app_push_subscriptions"
      ),
      safeSelect(
        admin
          .from("app_device_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        "app_device_events"
      ),
    ]);

  const userMap = new Map<string, PushUser>();

  [...profiles, ...companyUsers].forEach((row: any) => {
    const id = getUserKey(row);
    if (!id) return;

    userMap.set(id, {
      id,
      label: getUserName(row),
      email: getUserEmail(row),
      role: getUserRole(row),
    });
  });

  nativeTokens.forEach((row: any) => {
    const id = String(row?.user_id || row?.user_email || row?.token || "");
    if (!id) return;

    if (!userMap.has(id)) {
      userMap.set(id, {
        id: String(row?.user_id || id),
        label: row?.user_email || "Native Push User",
        email: row?.user_email || "",
        role: "user",
      });
    }
  });

  webSubscriptions.forEach((row: any) => {
    const id = String(row?.user_id || row?.user_email || row?.endpoint || "");
    if (!id) return;

    if (!userMap.has(id)) {
      userMap.set(id, {
        id: String(row?.user_id || id),
        label: row?.user_email || "Web Push User",
        email: row?.user_email || "",
        role: "user",
      });
    }
  });

  const nativeEnabled = nativeTokens.filter((row: any) => row?.enabled !== false);
  const webEnabled = webSubscriptions.filter((row: any) => row?.enabled !== false);
  const sentEvents = events.filter((event: any) =>
    String(event?.event_type || "").includes("push")
  );

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-yellow-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-yellow-400">
                Owner Push Center
              </p>
              <h1 className="mt-4 text-5xl font-black text-white">
                Broadcasts & Device Notifications
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Send owner-only push announcements to all users, all inspectors,
                native iOS devices, web devices, or a single user.
              </p>
            </div>

            <OwnerNav />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Native iOS Tokens"
            value={String(nativeEnabled.length)}
            helper="Enabled APNs device tokens."
            tone="purple"
          />
          <MetricCard
            label="Web Push Subscriptions"
            value={String(webEnabled.length)}
            helper="Enabled browser push endpoints."
            tone="teal"
          />
          <MetricCard
            label="Known Users"
            value={String(userMap.size)}
            helper="Users found from profiles, company users, and tokens."
            tone="blue"
          />
          <MetricCard
            label="Push Events"
            value={String(sentEvents.length)}
            helper="Recent push-related analytics events."
            tone="yellow"
          />
        </section>

        <Panel
          title="Send Notification"
          subtitle="Broadcast update, maintenance, report, agreement, or custom notices."
        >
          <OwnerPushNotificationCenter
            users={[...userMap.values()].sort((a, b) =>
              a.label.localeCompare(b.label)
            )}
            nativeCount={nativeEnabled.length}
            webCount={webEnabled.length}
          />
        </Panel>

        <Panel
          title="Recent Push Activity"
          subtitle="Recent push/token events from app device analytics."
        >
          {sentEvents.length === 0 ? (
            <EmptyState text="No push activity has been tracked yet." />
          ) : (
            <div className="space-y-3">
              {sentEvents.slice(0, 20).map((event: any, index: number) => (
                <div
                  key={event?.id || index}
                  className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-white">
                        {event?.event_type || "push_event"}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {event?.path || "/dashboard/owner/push"}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-slate-500">
                      {formatDateTime(event?.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}