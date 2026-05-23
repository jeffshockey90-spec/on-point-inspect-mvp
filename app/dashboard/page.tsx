import Link from "next/link";
import LogoutButton from "./logout-button";
import { createClient } from "../../utils/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "client";

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-teal-400">
              On Point Dashboard
            </h1>

            <p className="mt-1 text-slate-400">
              {profile?.full_name}
            </p>

            <p className="text-sm uppercase tracking-wider text-teal-400">
              {role}
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* INSPECTOR */}
        {role === "inspector" && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="New Inspection"
              description="Start a new inspection."
              href="/new"
            />

            <DashboardCard
              title="Reports"
              description="Manage reports."
              href="/reports"
            />

            <DashboardCard
              title="AI Capture"
              description="AI inspection workflow."
              href="/ai-capture"
            />

            <DashboardCard
              title="Clients"
              description="Manage clients."
              href="/clients"
            />

            <DashboardCard
              title="Templates"
              description="Report templates."
              href="/templates"
            />

            <DashboardCard
              title="Schedule"
              description="Inspection scheduling."
              href="/schedule"
            />
          </div>
        )}

        {/* REALTOR */}
        {role === "realtor" && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="Shared Reports"
              description="View shared inspection reports."
              href="/shared-reports"
            />

            <DashboardCard
              title="Repair Requests"
              description="Create repair request addendums."
              href="/repair-request"
            />

            <DashboardCard
              title="Schedule Inspection"
              description="Book inspections."
              href="/schedule"
            />
          </div>
        )}

        {/* CLIENT */}
        {role === "client" && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DashboardCard
              title="My Reports"
              description="View your reports."
              href="/my-reports"
            />

            <DashboardCard
              title="Repair Requests"
              description="Review repair items."
              href="/repair-request"
            />

            <DashboardCard
              title="Documents"
              description="Access agreements and PDFs."
              href="/documents"
            />
          </div>
        )}
      </div>
    </main>
  );
}

function DashboardCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-teal-400 hover:bg-slate-800"
    >
      <h2 className="text-xl font-semibold">
        {title}
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>
    </Link>
  );
}