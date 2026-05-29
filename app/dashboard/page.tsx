import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "./logout-button";
import { createClient } from "../../utils/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const role = profile?.role || user.user_metadata?.role || "client";
  const fullName =
    profile?.full_name || user.user_metadata?.full_name || user.email;

  const { data: inspections } = await supabase
    .from("inspections")
    .select("id, property_address, client_name, realtor_name, inspection_date, created_at")
    .or(
      `inspector_id.eq.${user.id},client_email.eq.${user.email},realtor_email.eq.${user.email}`
    )
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-teal-400">
              On Point Dashboard
            </h1>

            <p className="mt-1 text-slate-400">
              {fullName}
            </p>

            <p className="text-sm uppercase tracking-wider text-teal-400">
              {role}
            </p>
          </div>

          <LogoutButton />
        </div>

        {role === "inspector" && (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DashboardCard
                title="New Inspection"
                description="Start a new inspection."
                href="/new"
              />

              <DashboardCard
                title="Reports"
                description="Manage only your assigned reports."
                href="/reports"
              />

              <DashboardCard
                title="Analytics"
                description="Track inspections, revenue, add-ons, referrals, and report activity."
                href="/analytics"
              />

              <DashboardCard
                title="AI Capture"
                description="AI inspection workflow."
                href="/ai-capture"
              />

              <DashboardCard
                title="Equipment Analyzer"
                description="Analyze equipment photos."
                href="/equipment-test"
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

            <RecentReports inspections={inspections || []} />
          </>
        )}

        {role === "realtor" && (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DashboardCard
                title="Shared Reports"
                description="View reports shared with your email."
                href="/reports"
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

            <RecentReports inspections={inspections || []} />
          </>
        )}

        {role === "client" && (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DashboardCard
                title="My Reports"
                description="View reports connected to your email."
                href="/reports"
              />

              <DashboardCard
                title="Repair Requests"
                description="Review repair request items."
                href="/repair-request"
              />

              <DashboardCard
                title="Documents"
                description="Access agreements and PDFs."
                href="/documents"
              />
            </div>

            <RecentReports inspections={inspections || []} />
          </>
        )}
      </div>
    </main>
  );
}

function RecentReports({
  inspections,
}: {
  inspections: any[];
}) {
  return (
    <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-teal-400">
          Recent Reports
        </h2>

        <Link
          href="/reports"
          className="text-sm font-bold text-teal-300 hover:underline"
        >
          View All
        </Link>
      </div>

      {inspections.length === 0 ? (
        <p className="text-slate-400">
          No reports available for this account yet.
        </p>
      ) : (
        <div className="space-y-3">
          {inspections.map((inspection) => (
            <Link
              key={inspection.id}
              href={`/reports/${inspection.id}`}
              className="block rounded-xl border border-slate-800 bg-slate-950 p-4 transition hover:border-teal-400"
            >
              <h3 className="font-bold text-white">
                {inspection.property_address || "Untitled Inspection"}
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                Client: {inspection.client_name || "N/A"}{" "}
                {inspection.realtor_name
                  ? `• Realtor: ${inspection.realtor_name}`
                  : ""}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Inspection Date: {inspection.inspection_date || "N/A"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
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
      <h2 className="text-xl font-semibold">{title}</h2>

      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </Link>
  );
}
