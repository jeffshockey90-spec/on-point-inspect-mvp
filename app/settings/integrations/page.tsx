import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase/server";
import GoogleCalendarConnect from "../../../components/GoogleCalendarConnect";
import QuickBooksConnect from "../../../components/QuickBooksConnect";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-2xl border border-cyan-500/40 bg-[var(--fl-surface-2)] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Settings</p>
              <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Integrations</h1>
              <p className="mt-3 max-w-2xl text-[var(--fl-muted)]">
                Connect FLOW to the tools you already use.
              </p>
            </div>
            <Link
              href="/settings"
              className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
            >
              Back to Settings
            </Link>
          </div>
        </section>

        <Suspense fallback={<div className="text-[var(--fl-muted)]">Loading…</div>}>
          <GoogleCalendarConnect />
        </Suspense>

        <Suspense fallback={<div className="text-[var(--fl-muted)]">Loading…</div>}>
          <QuickBooksConnect />
        </Suspense>
      </div>
    </main>
  );
}
