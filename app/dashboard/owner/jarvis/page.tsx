import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { formatAppValue } from "../../../../lib/app-time";
import JarvisChat from "../../../../components/JarvisChat";
import JarvisThreads from "../../../../components/JarvisThreads";

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
  if (!user) redirect("/login?redirectedFrom=%2Fdashboard%2Fowner%2Fjarvis");
  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

function fmt(value: any) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatAppValue(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const SEV: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
  info: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
};
const STRIPE: Record<string, string> = {
  critical: "border-l-red-500",
  warning: "border-l-yellow-500",
  info: "border-l-teal-500",
};

export default async function JarvisPage() {
  const owner = await requireOwner();
  if (!owner) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-red-500/10 p-8">
          <h1 className="text-4xl font-semibold">Owner Only</h1>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-semibold text-[var(--fl-crit-text)]">Back</Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  let reports: any[] = [];
  try {
    const { data } = await admin
      .from("jarvis_reports")
      .select("id, kind, headline, body, severity, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    reports = data || [];
  } catch {
    reports = [];
  }

  const digests = reports.filter((r) => r.kind !== "fix_request");

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-3 py-6 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-teal-500/30 bg-[var(--fl-surface)] p-5 shadow-[0_20px_60px_-25px_rgba(45,212,191,0.4)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-300 via-teal-500 to-cyan-700 text-3xl shadow-[0_0_40px_-4px_rgba(45,212,191,0.7)]">
                🤖
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[var(--fl-surface)] bg-emerald-400" />
                </span>
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">Owner · Private</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Jarvis</h1>
                <p className="mt-1 max-w-2xl text-sm text-[var(--fl-muted)]">
                  Watching the whole platform — failures, security, deliverability, payments, activity. I flag what to fix or build; you confirm; we work it together.
                </p>
              </div>
            </div>
            <Link href="/dashboard/owner" className="rounded-xl border border-[var(--fl-line)] px-4 py-2.5 text-sm font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:bg-teal-500/10">
              ← Owner
            </Link>
          </div>
        </section>

        <JarvisChat />

        <JarvisThreads />

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 shadow-xl sm:p-6">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Health digests</h2>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">Jarvis&apos; scheduled sweeps. Urgent ones also buzz your phone.</p>
          {digests.length === 0 ? (
            <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
              No digests yet. The nightly sweep will post the first one here — or ask Jarvis for a read right now.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {digests.map((r) => (
                <li key={r.id} className={`rounded-2xl border border-l-4 border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4 ${STRIPE[r.severity] || STRIPE.info}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[var(--fl-text)]">{r.headline || "Health digest"}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${SEV[r.severity] || SEV.info}`}>{r.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--fl-faint)]">{fmt(r.created_at)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fl-muted)]">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
