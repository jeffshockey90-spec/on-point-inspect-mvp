import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-8">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-4 text-5xl font-black text-white">
            Inspection Dashboard
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-200">
            Manage inspections, reports, AI findings, templates, quotes, and
            scheduling from one clean dashboard.
          </p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <DashboardCard
            icon="🏠"
            title="New Inspection"
            description="Start a new inspection."
            href="/inspections/new"
          />

          <DashboardCard
            icon="📋"
            title="Reports"
            description="View and edit reports."
            href="/reports"
          />

          <DashboardCard
            icon="📊"
            title="Analytics"
            description="Track revenue, inspections, findings, referrals, and AI activity."
            href="/analytics"
          />

          <DashboardCard
            icon="🤖"
            title="AI Capture"
            description="Create findings from photos."
            href="/ai-capture"
          />

          <DashboardCard
            icon="🧮"
            title="Field Tool"
            description="Mobile AI inspection workflow."
            href="/field"
          />

          <DashboardCard
            icon="🧩"
            title="Templates"
            description="Manage templates."
            href="/templates"
          />

          <DashboardCard
            icon="💲"
            title="Quotes"
            description="Calculate pricing."
            href="/quotes"
          />

          <DashboardCard
            icon="🗓️"
            title="Schedule"
            description="View inspection schedule."
            href="/schedule"
          />
        </section>
      </div>
    </main>
  );
}

function DashboardCard({
  icon,
  title,
  description,
  href,
}: {
  icon: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 transition hover:border-teal-400 hover:bg-slate-800"
    >
      <div className="text-4xl">{icon}</div>

      <h2 className="mt-6 text-2xl font-black text-white">{title}</h2>

      <p className="mt-4 text-slate-300">{description}</p>

      <p className="mt-6 font-black text-teal-400">Open →</p>
    </Link>
  );
}