import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase/server";
import DeveloperSettings from "../../../components/DeveloperSettings";

export const dynamic = "force-dynamic";

export default async function DeveloperSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app";

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-cyan-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400">
                Developer
              </p>
              <h1 className="mt-3 text-4xl font-black md:text-5xl">API &amp; Webhooks</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                Programmatic access to your FLOW data, and signed event webhooks — the foundation
                for Zapier, custom integrations, and AI assistants.
              </p>
            </div>
            <Link
              href="/settings"
              className="rounded-xl border border-slate-600 px-5 py-3 font-black text-slate-200 transition hover:bg-slate-800"
            >
              Back to Settings
            </Link>
          </div>
        </section>

        <DeveloperSettings siteUrl={siteUrl} />
      </div>
    </main>
  );
}
