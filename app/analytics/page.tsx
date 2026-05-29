import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";

type AnyRecord = Record<string, any>;

const MONEY_FIELDS = [
  "total_price",
  "total",
  "price",
  "inspection_price",
  "inspection_fee",
  "fee",
  "amount",
  "invoice_amount",
  "payment_amount",
];

const DATE_FIELDS = ["inspection_date", "scheduled_date", "created_at"];

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function getMoneyValue(record: AnyRecord) {
  for (const field of MONEY_FIELDS) {
    const value = getNumber(record?.[field]);
    if (value > 0) return value;
  }

  return 0;
}

function getDateValue(record: AnyRecord) {
  for (const field of DATE_FIELDS) {
    const value = record?.[field];
    if (!value) continue;

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function isSameMonth(date: Date | null, now: Date) {
  if (!date) return false;

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function isSameYear(date: Date | null, now: Date) {
  if (!date) return false;

  return date.getFullYear() === now.getFullYear();
}

function money(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function getInspectionTitle(inspection: AnyRecord) {
  return (
    inspection.property_address ||
    inspection.address ||
    inspection.client_name ||
    "Untitled Inspection"
  );
}

function hasTruthyField(record: AnyRecord, fields: string[]) {
  return fields.some((field) => {
    const value = record?.[field];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    if (typeof value === "string") {
      const clean = value.toLowerCase().trim();
      return (
        clean === "true" ||
        clean === "yes" ||
        clean === "selected" ||
        clean === "included" ||
        clean === "paid" ||
        clean.includes("radon") ||
        clean.includes("mold")
      );
    }

    return false;
  });
}

function countBy(records: AnyRecord[], getter: (record: AnyRecord) => string) {
  return records.reduce((acc: Record<string, number>, record) => {
    const key = getter(record) || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(counts: Record<string, number>, limit = 5) {
  return Object.entries(counts)
    .filter(([key]) => key && key !== "Unknown" && key !== "N/A")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default async function AnalyticsPage() {
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

  if (role !== "inspector") {
    redirect("/dashboard");
  }

  const { data: inspectionsRaw, error: inspectionsError } = await supabase
    .from("inspections")
    .select("*")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  if (inspectionsError) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-800 bg-red-950/30 p-6">
          <h1 className="text-3xl font-black text-red-300">
            Analytics Error
          </h1>
          <p className="mt-3 text-red-100">{inspectionsError.message}</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-xl border border-red-400 px-5 py-3 font-bold text-red-200 hover:bg-red-500/10"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const inspections = inspectionsRaw || [];
  const inspectionIds = inspections.map((inspection: AnyRecord) => inspection.id);

  const { data: findingsRaw } =
    inspectionIds.length > 0
      ? await supabase
          .from("findings")
          .select("*")
          .in("inspection_id", inspectionIds)
      : { data: [] };

  const findings = findingsRaw || [];
  const now = new Date();

  const inspectionsThisMonth = inspections.filter((inspection: AnyRecord) =>
    isSameMonth(getDateValue(inspection), now)
  );

  const inspectionsThisYear = inspections.filter((inspection: AnyRecord) =>
    isSameYear(getDateValue(inspection), now)
  );

  const revenueThisMonth = inspectionsThisMonth.reduce(
    (total: number, inspection: AnyRecord) => total + getMoneyValue(inspection),
    0
  );

  const revenueThisYear = inspectionsThisYear.reduce(
    (total: number, inspection: AnyRecord) => total + getMoneyValue(inspection),
    0
  );

  const totalRevenue = inspections.reduce(
    (total: number, inspection: AnyRecord) => total + getMoneyValue(inspection),
    0
  );

  const averageInspection =
    inspections.length > 0 ? totalRevenue / inspections.length : 0;

  const completedReports = inspections.filter((inspection: AnyRecord) =>
    hasTruthyField(inspection, [
      "completed",
      "is_completed",
      "report_completed",
      "published",
      "is_published",
      "report_sent",
      "report_delivered",
    ])
  ).length;

  const radonCount = inspections.filter((inspection: AnyRecord) =>
    hasTruthyField(inspection, [
      "radon",
      "radon_test",
      "radon_addon",
      "radon_included",
      "services",
      "addons",
    ])
  ).length;

  const moldCount = inspections.filter((inspection: AnyRecord) =>
    hasTruthyField(inspection, [
      "mold",
      "mold_test",
      "mold_addon",
      "mold_included",
      "services",
      "addons",
    ])
  ).length;

  const severityCounts = countBy(findings, (finding) =>
    String(finding.severity || "Recommended Repair")
  );

  const sectionCounts = countBy(findings, (finding) =>
    String(finding.section || "Inspection Details")
  );

  const realtorCounts = countBy(inspections, (inspection) =>
    String(
      inspection.realtor_name ||
        inspection.agent_name ||
        inspection.realtor_email ||
        inspection.agent_email ||
        "N/A"
    )
  );

  const photoBackedFindings = findings.filter(
    (finding: AnyRecord) =>
      finding.image_url ||
      finding.public_image_url ||
      finding.signed_image_url ||
      finding.photo_url
  ).length;

  const recentInspections = inspections.slice(0, 6);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
              On Point Inspect
            </p>

            <h1 className="mt-2 text-5xl font-black text-white">
              Analytics Dashboard
            </h1>

            <p className="mt-3 max-w-3xl text-slate-300">
              Business overview for inspections, revenue, add-ons, referral
              sources, findings, and photo-backed report activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800"
            >
              Dashboard
            </Link>

            <Link
              href="/reports"
              className="rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 hover:bg-teal-400"
            >
              Reports
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Inspections This Month"
            value={inspectionsThisMonth.length}
            helper={`${inspectionsThisYear.length} this year`}
          />

          <MetricCard
            label="Revenue This Month"
            value={money(revenueThisMonth)}
            helper={`${money(revenueThisYear)} this year`}
          />

          <MetricCard
            label="Average Inspection"
            value={money(averageInspection)}
            helper={`${money(totalRevenue)} total tracked`}
          />

          <MetricCard
            label="Completed / Delivered"
            value={completedReports}
            helper={`${inspections.length} total inspections`}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Radon Add-Ons"
            value={radonCount}
            helper="Based on available inspection fields"
          />

          <MetricCard
            label="Mold Add-Ons"
            value={moldCount}
            helper="Based on available inspection fields"
          />

          <MetricCard
            label="Findings Created"
            value={findings.length}
            helper="All report findings"
          />

          <MetricCard
            label="Photo Findings"
            value={photoBackedFindings}
            helper="Findings with image fields"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <AnalyticsPanel title="Findings by Severity">
            <StatList entries={topEntries(severityCounts, 8)} empty="No findings yet." />
          </AnalyticsPanel>

          <AnalyticsPanel title="Findings by Section">
            <StatList entries={topEntries(sectionCounts, 10)} empty="No sections yet." />
          </AnalyticsPanel>

          <AnalyticsPanel title="Top Realtors / Referrals">
            <StatList entries={topEntries(realtorCounts, 8)} empty="No realtor data yet." />
          </AnalyticsPanel>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-teal-300">
                Recent Inspection Activity
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Latest inspections connected to your inspector account.
              </p>
            </div>

            <Link
              href="/reports"
              className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-500/10"
            >
              View All Reports
            </Link>
          </div>

          {recentInspections.length === 0 ? (
            <p className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-slate-400">
              No inspection activity yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Realtor</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 bg-[#071224]">
                  {recentInspections.map((inspection: AnyRecord) => (
                    <tr key={inspection.id}>
                      <td className="px-4 py-4 font-bold text-white">
                        {getInspectionTitle(inspection)}
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {inspection.client_name || "N/A"}
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {inspection.realtor_name ||
                          inspection.agent_name ||
                          "N/A"}
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {inspection.inspection_date ||
                          inspection.scheduled_date ||
                          "N/A"}
                      </td>

                      <td className="px-4 py-4 text-right font-bold text-teal-300">
                        {money(getMoneyValue(inspection))}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/reports/${inspection.id}`}
                          className="font-bold text-teal-300 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-yellow-700 bg-yellow-950/20 p-5 text-yellow-100">
          <h2 className="text-xl font-black text-yellow-300">
            Revenue Note
          </h2>

          <p className="mt-2 text-sm leading-6">
            Revenue uses whichever price field exists on each inspection, such
            as total_price, price, inspection_fee, amount, or invoice_amount.
            If those fields are empty, revenue will show $0 until payments or
            invoice fields are added.
          </p>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-3 text-4xl font-black text-teal-300">{value}</p>

      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

function AnalyticsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
      <h2 className="mb-4 text-2xl font-black text-teal-300">{title}</h2>
      {children}
    </div>
  );
}

function StatList({
  entries,
  empty,
}: {
  entries: [string, number][];
  empty: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-slate-400">
        {empty}
      </p>
    );
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <div className="space-y-3">
      {entries.map(([label, count]) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="line-clamp-1 text-sm font-bold text-slate-200">
              {label}
            </span>

            <span className="text-sm font-black text-teal-300">{count}</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-400"
              style={{ width: `${Math.max(8, (count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
