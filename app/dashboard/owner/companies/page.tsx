
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import FastLinkButton from "../../../../components/FastLinkButton";
import SubscriptionPricingEditor from "../../../../components/SubscriptionPricingEditor";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return formatAppValue(date, { month: "short", day: "numeric", year: "numeric" });
}

function subscriptionLabel(profile: any) {
  if (!profile) return { label: "No Owner Profile", tone: "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]" };
  if (profile.subscription_exempt === true || profile.subscription_required === false) {
    return { label: "Exempt", tone: "border-blue-500/40 bg-blue-500/10 text-blue-200" };
  }

  const status = String(profile.subscription_status || "").toLowerCase();
  if (status === "active" || status === "trialing") {
    return { label: profile.founding_member ? "Active (Founding)" : "Active", tone: "border-green-500/40 bg-green-500/10 text-green-200" };
  }

  const used = Number(profile.free_inspections_used ?? 0);
  const limit = Number(profile.free_inspection_limit ?? 3);
  if (used < limit) {
    return { label: `Free Trial (${used}/${limit})`, tone: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]" };
  }

  return { label: "Needs Subscription", tone: "border-red-500/40 bg-red-500/10 text-red-200" };
}

export default async function OwnerCompaniesPage() {
  const supabase = await createUserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = String(user?.email || "").toLowerCase();

  if (!user || !OWNER_EMAILS.includes(userEmail)) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const [{ data: companies }, { data: companyUsers }, { data: inspections }] = await Promise.all([
    admin.from("companies").select("*").order("created_at", { ascending: false }),
    admin.from("company_users").select("company_id,user_id,role"),
    admin.from("inspections").select("id,company_id,invoice_amount,total_price,total,price").neq("is_demo", true),
  ]);

  const ownerUserIdByCompany = new Map<string, string>();
  (companyUsers || []).forEach((row: any) => {
    if (String(row.role || "").toLowerCase() !== "owner") return;
    if (!ownerUserIdByCompany.has(String(row.company_id))) {
      ownerUserIdByCompany.set(String(row.company_id), String(row.user_id));
    }
  });

  const ownerUserIds = Array.from(new Set(Array.from(ownerUserIdByCompany.values()).filter(Boolean)));

  const { data: profiles } = ownerUserIds.length
    ? await admin.from("profiles").select("*").in("id", ownerUserIds)
    : { data: [] as any[] };

  const profileById = new Map((profiles || []).map((p: any) => [String(p.id), p]));

  const inspectionCountByCompany = new Map<string, number>();
  (inspections || []).forEach((row: any) => {
    const id = String(row.company_id || "");
    if (!id) return;
    inspectionCountByCompany.set(id, (inspectionCountByCompany.get(id) || 0) + 1);
  });

  const rows = (companies || []).map((company: any) => {
    const companyId = String(company.id);
    const ownerUserId = ownerUserIdByCompany.get(companyId) || "";
    const ownerProfile = profileById.get(ownerUserId) || null;
    const subscription = subscriptionLabel(ownerProfile);

    return {
      id: companyId,
      name: company.display_name || company.name || "Untitled Company",
      email: company.email || ownerProfile?.email || "N/A",
      createdAt: company.created_at,
      isActive: company.is_active !== false,
      isDeleted: Boolean(company.deleted_at || company.deletion_requested_at),
      inspectionCount: inspectionCountByCompany.get(companyId) || 0,
      subscription,
      ownerUserId,
    };
  });

  const activeCompanies = rows.filter((row) => row.isActive && !row.isDeleted);
  const inactiveCompanies = rows.filter((row) => !row.isActive || row.isDeleted);

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">Owner Dashboard</p>
              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">Companies</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Every company signed up to use FLOW, their subscription status, and usage. To
                suspend or reactivate a specific account, use User Management.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <FastLinkButton
                href="/dashboard/owner/users"
                className="rounded-xl border border-cyan-500 px-5 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-500/10"
              >
                👥 User Management
              </FastLinkButton>

              <FastLinkButton
                href="/dashboard/owner"
                className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
              >
                Back to Owner Dashboard
              </FastLinkButton>
            </div>
          </div>
        </section>

        <SubscriptionPricingEditor />

        <section className="grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Total Companies</p>
            <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-green-500/40 bg-green-950/20 p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Active</p>
            <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{activeCompanies.length}</p>
          </div>
          <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Inactive / Deleted</p>
            <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{inactiveCompanies.length}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">All Companies</h2>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--fl-raised)] text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                  <th className="pb-3 pr-4">Company</th>
                  <th className="pb-3 pr-4">Contact</th>
                  <th className="pb-3 pr-4">Subscription</th>
                  <th className="pb-3 pr-4">Inspections</th>
                  <th className="pb-3 pr-4">Created</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Manage</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[var(--fl-muted)]">
                      No companies found yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--fl-raised)]">
                      <td className="py-3 pr-4 font-bold text-[var(--fl-text)]">{row.name}</td>
                      <td className="py-3 pr-4 text-[var(--fl-muted)]">{row.email}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.subscription.tone}`}>
                          {row.subscription.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[var(--fl-muted)]">{row.inspectionCount}</td>
                      <td className="py-3 pr-4 text-[var(--fl-muted)]">{formatDate(row.createdAt)}</td>
                      <td className="py-3 pr-4">
                        {row.isDeleted ? (
                          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                            Deleted
                          </span>
                        ) : row.isActive ? (
                          <span className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {row.ownerUserId ? (
                          <Link
                            href={`/dashboard/owner/users?highlight=${encodeURIComponent(row.ownerUserId)}`}
                            className="font-bold text-cyan-300 hover:text-cyan-200"
                          >
                            View in Users →
                          </Link>
                        ) : (
                          <span className="text-[var(--fl-faint)]">No owner found</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
