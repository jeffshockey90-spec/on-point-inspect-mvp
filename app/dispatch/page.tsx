import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import DispatchBoard from "../../components/DispatchBoard";
import { formatUsd } from "../../lib/currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    },
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
    },
  );
}

function getAddress(inspection: any) {
  const parts = [inspection.property_address || inspection.address, inspection.city, inspection.state]
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Address not entered";
}

function isCompletedJob(inspection: any) {
  return inspection.is_published === true || String(inspection.report_status || "").toLowerCase() === "published";
}

export default async function DispatchPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: ownerRow } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!ownerRow?.company_id) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-10 text-[var(--fl-text)]">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--fl-text)]">Dispatch</h1>
          <p className="mt-3 text-[var(--fl-muted)]">
            Only the company owner can assign inspections to team members.
          </p>
          <Link href="/schedule" className="mt-6 inline-block rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400">
            Back to Schedule
          </Link>
        </div>
      </main>
    );
  }

  const [{ data: teamRows }, { data: inspections }] = await Promise.all([
    admin
      .from("company_users")
      .select("user_id, role")
      .eq("company_id", ownerRow.company_id),
    admin
      .from("inspections")
      .select("id, property_address, address, city, state, client_name, inspection_date, inspection_time, inspector_id, price, amount_paid, balance_due, is_published, report_status")
      .eq("company_id", ownerRow.company_id)
      .order("inspection_date", { ascending: false }),
  ]);

  const teamUserIds = (teamRows || []).map((row: any) => row.user_id).filter(Boolean);

  const { data: teamProfiles } = teamUserIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", teamUserIds)
    : { data: [] };

  const profileById = new Map((teamProfiles || []).map((profile: any) => [profile.id, profile]));

  const teamMembers = (teamRows || []).map((row: any) => {
    const profile: any = profileById.get(row.user_id);
    const label = profile?.full_name || profile?.email || "Team member";
    return { userId: row.user_id, label: `${label}${row.role === "owner" ? " (Owner)" : ""}` };
  });

  const rows = (inspections || []).map((inspection: any) => ({
    id: String(inspection.id),
    address: getAddress(inspection),
    client: inspection.client_name || "Client not entered",
    date: inspection.inspection_date || "",
    time: inspection.inspection_time || "",
    inspectorId: inspection.inspector_id || "",
  }));

  const statsByInspector = teamMembers.map((member) => {
    const memberJobs = (inspections || []).filter(
      (inspection: any) => inspection.inspector_id === member.userId,
    );
    const completedJobs = memberJobs.filter(isCompletedJob);
    const revenue = memberJobs.reduce(
      (sum: number, inspection: any) => sum + Number(inspection.amount_paid || 0),
      0,
    );
    const outstanding = memberJobs.reduce(
      (sum: number, inspection: any) => sum + Number(inspection.balance_due || 0),
      0,
    );

    return {
      label: member.label,
      totalJobs: memberJobs.length,
      completedJobs: completedJobs.length,
      revenue,
      outstanding,
      avgJobValue: memberJobs.length ? revenue / memberJobs.length : 0,
    };
  });

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-teal-500/30 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
            Team
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">Dispatch</h1>
          <p className="mt-3 max-w-2xl text-[var(--fl-muted)]">
            Assign inspections to team members and see who has what on their schedule.
          </p>
        </section>

        {teamMembers.length <= 1 ? (
          <div className="rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-sm text-[var(--fl-muted)]">
            You&apos;re the only inspector on this account right now. Add a teammate under Settings to start assigning jobs.
          </div>
        ) : (
          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl md:p-8">
            <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Team Performance</h2>
            <p className="mt-2 text-sm text-[var(--fl-muted)]">
              Revenue reflects amount collected per inspector across all their assigned jobs.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {statsByInspector.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-5">
                  <p className="font-semibold text-[var(--fl-text)]">{stat.label}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--fl-muted)]">Jobs Assigned</span>
                      <span className="font-bold text-[var(--fl-text)]">{stat.totalJobs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--fl-muted)]">Published Reports</span>
                      <span className="font-bold text-[var(--fl-text)]">{stat.completedJobs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--fl-muted)]">Revenue Collected</span>
                      <span className="font-bold text-[var(--fl-accent-text)]">{formatUsd(stat.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--fl-muted)]">Avg Job Value</span>
                      <span className="font-bold text-[var(--fl-text)]">{formatUsd(stat.avgJobValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--fl-muted)]">Outstanding Balance</span>
                      <span className="font-bold text-orange-300">{formatUsd(stat.outstanding)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl md:p-8">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Assign Inspections</h2>
          <p className="mt-2 text-sm text-[var(--fl-muted)]">
            Reassign any job to a different team member. Changes save immediately.
          </p>

          <div className="mt-6">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-sm text-[var(--fl-muted)]">
                No inspections yet.
              </div>
            ) : (
              <DispatchBoard inspections={rows} teamMembers={teamMembers} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
