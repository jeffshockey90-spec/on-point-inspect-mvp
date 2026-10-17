import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import CoderConsole from "../../../../components/CoderConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireOwner() {
  const cookieStore = await cookies();
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await c.auth.getUser();
  if (!user) redirect("/login?redirectedFrom=%2Fdashboard%2Fowner%2Fcoder");
  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

export default async function CoderPage() {
  const owner = await requireOwner();
  if (!owner) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-8 text-[var(--fl-text)]">
        <h1 className="text-2xl font-bold text-[var(--fl-crit-text)]">Owner only</h1>
      </main>
    );
  }
  const connected = Boolean(process.env.GITHUB_CODER_TOKEN);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">⚡ Claude Coder</p>
            <h1 className="mt-1 text-3xl font-extrabold">Build or fix — from here</h1>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Describe a change. Claude Code builds it on a branch, runs the build, and brings you a diff to review. Nothing ships until you approve &amp; merge.
            </p>
          </div>
          <Link href="/dashboard/owner/jarvis" className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--fl-raised)]">
            ← Jarvis
          </Link>
        </div>
        <CoderConsole connected={connected} />
      </div>
    </main>
  );
}
