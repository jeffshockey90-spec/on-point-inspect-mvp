
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { resolveTeamInspectorIds } from "../../../lib/inspectionAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value: any) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInspectionDate(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function getInspectionPrice(inspection: any) {
  const candidates = [
    inspection?.price,
    inspection?.invoice_amount,
    inspection?.total_price,
    inspection?.total,
    inspection?.inspection_price,
    inspection?.inspection_fee,
  ];

  for (const value of candidates) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const sqft = Number(
    String(inspection?.square_feet || inspection?.sqft || "").replace(
      /[^0-9.-]/g,
      ""
    )
  );

  if (Number.isFinite(sqft) && sqft > 0) {
    if (sqft <= 2000) return 500;
    return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
  }

  return 0;
}

function getBalanceDue(inspection: any) {
  const balance = Number(
    String(inspection?.balance_due || "").replace(/[^0-9.-]/g, "")
  );

  if (Number.isFinite(balance) && balance > 0) return balance;

  const invoiceAmount = getInspectionPrice(inspection);
  const amountPaid = Number(
    String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, "")
  );

  return Math.max(
    0,
    invoiceAmount - (Number.isFinite(amountPaid) ? amountPaid : 0)
  );
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = Number(
    String(inspection?.amount_paid || "").replace(/[^0-9.-]/g, "")
  );

  if (price > 0 && Number.isFinite(paid) && paid >= price) return true;

  return getBalanceDue(inspection) <= 0 && paid > 0;
}

function normalize(value: any) {
  return String(value || "").trim().toLowerCase();
}

function realtorMatchesInspection(realtor: any, inspection: any) {
  const realtorIdMatch =
    inspection?.realtor_id && String(inspection.realtor_id) === String(realtor.id);

  const realtorEmail = normalize(realtor?.email);
  const inspectionEmails = [
    inspection?.realtor_email,
    inspection?.agent_email,
    inspection?.transaction_coordinator_email,
  ]
    .filter(Boolean)
    .map(normalize);

  const emailMatch = Boolean(realtorEmail && inspectionEmails.includes(realtorEmail));

  const realtorName = normalize(realtor?.name);
  const inspectionNames = [
    inspection?.realtor_name,
    inspection?.agent_name,
    inspection?.transaction_coordinator_name,
  ]
    .filter(Boolean)
    .map(normalize);

  const nameMatch = Boolean(realtorName && inspectionNames.includes(realtorName));

  return realtorIdMatch || emailMatch || nameMatch;
}

function getRealtorStats(realtor: any, inspections: any[]) {
  const matchedInspections = inspections
    .filter((inspection) => realtorMatchesInspection(realtor, inspection))
    .sort(
      (a: any, b: any) =>
        new Date(getInspectionDate(b) || 0).getTime() -
        new Date(getInspectionDate(a) || 0).getTime()
    );

  const revenue = matchedInspections.reduce(
    (sum: number, inspection: any) => sum + getInspectionPrice(inspection),
    0
  );

  const paidRevenue = matchedInspections
    .filter(isPaymentComplete)
    .reduce((sum: number, inspection: any) => sum + getInspectionPrice(inspection), 0);

  const pendingBalance = matchedInspections.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  const lastInspection = matchedInspections[0] || null;

  return {
    realtor,
    inspections: matchedInspections,
    referralCount: matchedInspections.length,
    revenue,
    paidRevenue,
    pendingBalance,
    lastReferralDate: getInspectionDate(lastInspection),
    lastInspection,
  };
}

export default async function RealtorLeaderboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const teamIds = await resolveTeamInspectorIds(supabase, user.id);

  const { data: realtorsRaw, error: realtorsError } = await supabase
    .from("realtors")
    .select("*")
    .in("inspector_id", teamIds)
    .order("name", { ascending: true });

  if (realtorsError) {
    console.error("Realtor leaderboard realtors load error:", realtorsError);
  }

  const { data: inspectionsRaw, error: inspectionsError } = await supabase
    .from("inspections")
    .select("*")
    .in("inspector_id", teamIds)
    .order("created_at", { ascending: false });

  if (inspectionsError) {
    console.error("Realtor leaderboard inspections load error:", inspectionsError);
  }

  const realtors = realtorsRaw || [];
  const inspections = inspectionsRaw || [];

  const leaderboard = realtors
    .map((realtor: any) => getRealtorStats(realtor, inspections))
    .sort((a, b) => {
      if (b.referralCount !== a.referralCount) {
        return b.referralCount - a.referralCount;
      }

      return b.revenue - a.revenue;
    });

  const activeRealtors = leaderboard.filter((item) => item.referralCount > 0);
  const noReferralRealtors = leaderboard.filter((item) => item.referralCount === 0);

  const totalReferrals = leaderboard.reduce(
    (sum, item) => sum + item.referralCount,
    0
  );

  const totalRevenue = leaderboard.reduce((sum, item) => sum + item.revenue, 0);
  const totalPaidRevenue = leaderboard.reduce(
    (sum, item) => sum + item.paidRevenue,
    0
  );
  const totalPendingBalance = leaderboard.reduce(
    (sum, item) => sum + item.pendingBalance,
    0
  );

  const topRealtor = activeRealtors[0] || null;

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                Realtor Analytics
              </p>

              <h1 className="mt-4 text-4xl font-semibold text-[var(--fl-text)] md:text-5xl">
                Referral Leaderboard
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                See which realtor relationships are driving inspections, revenue,
                paid revenue, and outstanding balances for FLOW.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/realtors"
                className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
              >
                Realtors
              </Link>

              <Link
                href="/analytics"
                className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 transition hover:bg-purple-500/10"
              >
                Analytics
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Realtors" value={String(realtors.length)} />
          <StatCard label="Active Referrers" value={String(activeRealtors.length)} />
          <StatCard label="Total Referrals" value={String(totalReferrals)} />
          <StatCard label="Referral Revenue" value={money(totalRevenue)} />
          <StatCard
            label="Outstanding"
            value={money(totalPendingBalance)}
            helper={`Paid revenue: ${money(totalPaidRevenue)}`}
          />
        </section>

        {topRealtor && (
          <section className="mt-8 rounded-2xl border border-teal-500/40 bg-teal-950/20 p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                  Top Referral Partner
                </p>

                <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                  {topRealtor.realtor.name}
                </h2>

                <p className="mt-2 text-[var(--fl-muted)]">
                  {topRealtor.referralCount} referral
                  {topRealtor.referralCount === 1 ? "" : "s"} •{" "}
                  {money(topRealtor.revenue)} generated
                </p>
              </div>

              <Link
                href={`/realtors/${topRealtor.realtor.id}`}
                className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-teal-400"
              >
                View Realtor
              </Link>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
                Top Realtors
              </h2>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Sorted by referral count first, then total revenue.
              </p>
            </div>

            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)]">
              {activeRealtors.length} active
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--fl-raised)]">
            <div className="hidden grid-cols-[70px_1.6fr_0.7fr_0.9fr_0.9fr_0.9fr_1fr] gap-4 border-b border-[var(--fl-raised)] bg-[var(--fl-ground)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)] lg:grid">
              <div>Rank</div>
              <div>Realtor</div>
              <div>Referrals</div>
              <div>Revenue</div>
              <div>Paid</div>
              <div>Outstanding</div>
              <div>Last Referral</div>
            </div>

            {activeRealtors.length === 0 ? (
              <div className="bg-[var(--fl-surface-2)] p-8 text-center text-[var(--fl-muted)]">
                No realtor referrals are linked yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--fl-raised)]">
                {activeRealtors.map((item, index) => (
                  <LeaderboardRow
                    key={item.realtor.id}
                    item={item}
                    rank={index + 1}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {noReferralRealtors.length > 0 && (
          <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-[var(--fl-text)]">
              Realtors With No Linked Referrals Yet
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              These contacts are in your CRM but do not currently match any inspections
              by realtor ID, email, or name.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {noReferralRealtors.map((item) => (
                <Link
                  key={item.realtor.id}
                  href={`/realtors/${item.realtor.id}`}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 transition hover:border-teal-500/60"
                >
                  <p className="font-semibold text-[var(--fl-text)]">{item.realtor.name}</p>

                  <p className="mt-1 text-sm text-[var(--fl-muted)]">
                    {item.realtor.email || "No email saved"}
                  </p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-yellow-300">
                    No linked inspections
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-[var(--fl-text)]">{value}</p>

      {helper && <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>}
    </div>
  );
}

function LeaderboardRow({ item, rank }: { item: any; rank: number }) {
  const medal =
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <Link
      href={`/realtors/${item.realtor.id}`}
      className="block bg-[var(--fl-surface-2)] px-5 py-5 transition hover:bg-[#071224] lg:grid lg:grid-cols-[70px_1.6fr_0.7fr_0.9fr_0.9fr_0.9fr_1fr] lg:items-center lg:gap-4"
    >
      <div className="text-2xl font-semibold text-[var(--fl-text)]">{medal}</div>

      <div className="mt-3 lg:mt-0">
        <p className="text-lg font-semibold text-[var(--fl-text)]">{item.realtor.name}</p>

        <p className="mt-1 text-sm text-[var(--fl-muted)]">
          {item.realtor.email || "No email saved"}
        </p>
      </div>

      <MobileMetric label="Referrals" value={String(item.referralCount)} />
      <MobileMetric label="Revenue" value={money(item.revenue)} />
      <MobileMetric label="Paid" value={money(item.paidRevenue)} />
      <MobileMetric label="Outstanding" value={money(item.pendingBalance)} />
      <MobileMetric
        label="Last Referral"
        value={formatDate(item.lastReferralDate)}
      />
    </Link>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 lg:mt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)] lg:hidden">
        {label}
      </p>

      <p className="mt-1 font-semibold text-[var(--fl-accent-text)] lg:mt-0">{value}</p>
    </div>
  );
}
