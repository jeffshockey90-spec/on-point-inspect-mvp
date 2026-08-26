import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import OwnerMailComposer from "./OwnerMailComposer";
import InboxReplies from "./InboxReplies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireOwner() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

async function safeSelect(query: PromiseLike<{ data: any; error: any }>) {
  try {
    const { data } = await query;
    return Array.isArray(data) ? data : data ? [data] : [];
  } catch {
    return [];
  }
}

function getEmail(row: any) {
  return String(row?.email || row?.user_email || row?.owner_email || row?.auth_email || "").toLowerCase();
}
function getName(row: any) {
  return row?.full_name || row?.display_name || row?.business_name || row?.company_name || row?.name || getEmail(row) || "Inspector";
}
function getKey(row: any) {
  return String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || getEmail(row) || "");
}
function getRole(row: any) {
  return String(row?.role || row?.account_type || row?.user_role || (row?.inspector_id ? "inspector" : "") || "").toLowerCase();
}
function isAfter(value: any, when: Date) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d >= when;
}
function fmt(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatAppValue(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function OwnerNav({ unread = 0 }: { unread?: number }) {
  const links = [
    ["/dashboard/owner", "Owner"],
    ["/dashboard/owner/inspectors", "🧑 Inspectors"],
    ["/dashboard/owner/mail", "📧 Mail"],
    ["/dashboard/owner/push", "🔔 Push"],
    ["/dashboard/owner/revenue", "💰 Revenue"],
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="relative rounded-xl border border-slate-600 px-3 py-2 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:bg-teal-500/10 sm:px-4 sm:py-3">
          {label}
          {href === "/dashboard/owner/mail" && unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1.5 text-[11px] font-black text-slate-950">
              {unread}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function statusOf(m: any) {
  if (m.bounced_at || m.status === "failed") return { label: "Failed", tone: "border-red-500/40 bg-red-500/10 text-red-300" };
  if (m.clicked_at) return { label: "Clicked", tone: "border-teal-400/40 bg-teal-500/10 text-teal-200" };
  if (m.opened_at) return { label: "Opened", tone: "border-blue-400/40 bg-blue-500/10 text-blue-200" };
  if (m.delivered_at) return { label: "Delivered", tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
  return { label: "Sent", tone: "border-slate-600 bg-slate-800/60 text-slate-300" };
}

export default async function OwnerMailPage() {
  const owner = await requireOwner();
  if (!owner) {
    return (
      <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8">
          <h1 className="text-4xl font-black">Owner Only</h1>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-black text-red-300">Back</Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [profiles, inspectorProfiles, companyUsers, inspections, deviceEvents, messages, replies] = await Promise.all([
    safeSelect(admin.from("profiles").select("*")),
    safeSelect(admin.from("inspector_profiles").select("*")),
    safeSelect(admin.from("company_users").select("*")),
    safeSelect(admin.from("inspections").select("inspector_id,user_id,created_at,inspection_date,is_demo")),
    safeSelect(admin.from("app_device_events").select("user_email,user_id,created_at").order("created_at", { ascending: false }).limit(2000)),
    safeSelect(admin.from("owner_inspector_messages").select("*").order("sent_at", { ascending: false }).limit(100)),
    safeSelect(admin.from("inbound_replies").select("*").order("received_at", { ascending: false }).limit(100)),
  ]);

  const unreadReplies = replies.filter((r: any) => !r.is_read).length;

  const users = new Map<string, any>();
  [...profiles, ...companyUsers].forEach((row: any) => {
    const id = getKey(row);
    if (id) users.set(id, { ...row, id, name: getName(row), email: getEmail(row), role: getRole(row) });
  });
  inspectorProfiles.forEach((row: any) => {
    const id = String(row?.inspector_id || row?.id || "");
    if (id) users.set(id, { ...(users.get(id) || {}), ...row, id, name: getName(row), email: getEmail(row), role: "inspector" });
  });

  const inspectionByInspector = new Map<string, any[]>();
  inspections.forEach((i: any) => {
    if (i?.is_demo === true) return;
    const id = String(i?.inspector_id || i?.user_id || "");
    if (!id) return;
    (inspectionByInspector.get(id) || inspectionByInspector.set(id, []).get(id))!.push(i);
    if (!users.has(id)) users.set(id, { id, name: "Inspector", email: "", role: "inspector" });
  });

  const inspectors = [...users.values()]
    .filter((r) => r.email && (String(r.role).includes("inspector") || inspectionByInspector.has(r.id)))
    .map((r) => {
      const insp = inspectionByInspector.get(r.id) || [];
      const latestReport = insp.map((i: any) => i?.created_at || i?.inspection_date).filter(Boolean).sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
      const latestDevice = deviceEvents.find((e: any) => (r.email && String(e?.user_email || "").toLowerCase() === r.email) || String(e?.user_id || "") === r.id);
      const lastActivity = latestDevice?.created_at || latestReport;
      return { name: r.name, email: r.email, active30: isAfter(lastActivity, thirtyDaysAgo), lastActivity };
    })
    .sort((a, b) => Number(a.active30) - Number(b.active30) || a.name.localeCompare(b.name));

  return (
    <main className="min-h-screen bg-[#020617] px-3 py-6 text-white md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-5 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">Owner Mail Center</p>
              <h1 className="mt-3 text-3xl font-black sm:text-4xl">Email your inspectors</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                Send a re-engagement message to one inspector, everyone, or just the quiet ones — then track opens below.
              </p>
            </div>
            <OwnerNav unread={unreadReplies} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-2xl font-black text-teal-300">
              Inbox — replies
              {unreadReplies > 0 && (
                <span className="rounded-full bg-teal-500 px-2.5 py-0.5 text-sm font-black text-slate-950">
                  {unreadReplies} new
                </span>
              )}
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Replies to your FLOW emails land here and buzz your phone. Reply right from FLOW — it sends from support@flowinspect.app.
          </p>
          <InboxReplies replies={replies as any} />
        </section>

        <OwnerMailComposer inspectors={inspectors} />

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4 shadow-xl sm:p-6">
          <h2 className="text-2xl font-black text-teal-300">Sent mail</h2>
          <p className="mt-1 text-sm text-slate-400">The last {messages.length} emails sent to inspectors, with delivery status.</p>
          {messages.length === 0 ? (
            <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">Nothing sent yet.</div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2 pr-3">Recipient</th>
                    <th className="pb-2 pr-3">Subject</th>
                    <th className="pb-2 pr-3">Sent</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m: any) => {
                    const s = statusOf(m);
                    return (
                      <tr key={m.id} className="border-t border-slate-800">
                        <td className="py-2 pr-3">
                          <div className="font-bold text-white">{m.recipient_name || m.recipient_email}</div>
                          {m.recipient_name && <div className="text-xs text-slate-500">{m.recipient_email}</div>}
                        </td>
                        <td className="py-2 pr-3 text-slate-300">{m.subject || "—"}</td>
                        <td className="py-2 pr-3 text-slate-400">{fmt(m.sent_at)}</td>
                        <td className="py-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${s.tone}`}>{s.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
