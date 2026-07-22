
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

type Tone = "teal" | "green" | "blue" | "purple" | "orange" | "yellow" | "red";

type InspectorRevenueRow = {
  inspectorId: string;
  inspectorName: string;
  inspectorEmail: string;
  reports: number;
  paidReports: number;
  revenue: number;
  averageValue: number;
  lastReport: string | null;
};

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

async function safeSelect<T = any>(
  query: PromiseLike<{ data: T | null; error: any }>,
  label: string
) {
  try {
    const { data, error } = await query;

    if (error) {
      console.error(`Owner revenue ${label} error:`, error);
      return [] as any[];
    }

    return (Array.isArray(data) ? data : data ? [data] : []) as any[];
  } catch (error) {
    console.error(`Owner revenue ${label} exception:`, error);
    return [] as any[];
  }
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function getInspectionPrice(inspection: any) {
  return (
    getNumber(inspection?.price) ||
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    getNumber(inspection?.amount_due) ||
    calculatePriceFromSqft(inspection?.square_feet || inspection?.sqft) ||
    0
  );
}

function getPaidAmount(inspection: any) {
  return (
    getNumber(inspection?.amount_paid) ||
    getNumber(inspection?.paid_amount) ||
    getNumber(inspection?.stripe_amount_paid) ||
    0
  );
}

function isPaidInspection(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || inspection?.status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived" || status === "complete" || status === "completed") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);

  return price > 0 && paid >= price;
}

function getInspectionRevenue(inspection: any) {
  if (!isPaidInspection(inspection)) return 0;

  return getPaidAmount(inspection) || getInspectionPrice(inspection);
}

function getInspectionDate(inspection: any) {
  return (
    inspection?.inspection_date ||
    inspection?.scheduled_date ||
    inspection?.paid_at ||
    inspection?.created_at ||
    ""
  );
}

function getMonthKey(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";

  return formatAppValue(date, {
    month: "short",
    year: "numeric",
  });
}

function getDayKey(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No Date";

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isThisMonth(value: any, now = new Date()) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isAfter(value: any, compareDate: Date) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date >= compareDate;
}

function getInspectorId(inspection: any) {
  return String(inspection?.inspector_id || inspection?.user_id || "");
}

function getUserKey(row: any) {
  return String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || row?.email || "");
}

function getUserEmail(row: any) {
  return String(row?.email || row?.user_email || row?.owner_email || row?.auth_email || "").toLowerCase();
}

function getUserName(row: any) {
  return (
    row?.full_name ||
    row?.display_name ||
    row?.business_name ||
    row?.company_name ||
    row?.name ||
    getUserEmail(row) ||
    "Unknown Inspector"
  );
}

function getInvoiceAmount(invoice: any) {
  return (
    getNumber(invoice?.amount) ||
    getNumber(invoice?.amount_due) ||
    getNumber(invoice?.invoice_amount) ||
    getNumber(invoice?.total) ||
    getNumber(invoice?.total_amount) ||
    0
  );
}

function getInvoicePaidAmount(invoice: any) {
  return (
    getNumber(invoice?.amount_paid) ||
    getNumber(invoice?.paid_amount) ||
    getNumber(invoice?.paid) ||
    0
  );
}

function isPaidInvoice(invoice: any) {
  const status = String(invoice?.status || invoice?.invoice_status || invoice?.payment_status || "").toLowerCase();

  return status === "paid" || Boolean(invoice?.paid_at) || getInvoicePaidAmount(invoice) >= getInvoiceAmount(invoice);
}

function isOpenInvoice(invoice: any) {
  const status = String(invoice?.status || invoice?.invoice_status || invoice?.payment_status || "").toLowerCase();

  if (isPaidInvoice(invoice)) return false;
  if (status.includes("void") || status.includes("cancel")) return false;

  return getInvoiceAmount(invoice) > 0;
}

function getServiceRevenue(rows: any[]) {
  return rows.reduce((sum, row) => {
    const status = String(row?.payment_status || row?.status || "").toLowerCase();
    const paid =
      getNumber(row?.amount_paid) ||
      getNumber(row?.paid_amount) ||
      getNumber(row?.price) ||
      getNumber(row?.fee) ||
      getNumber(row?.total) ||
      0;

    if (status && status !== "paid" && status !== "complete" && status !== "completed") {
      return sum;
    }

    return sum + paid;
  }, 0);
}

function buildInspectorRows({
  profiles,
  inspectorProfiles,
  companyUsers,
  inspections,
}: {
  profiles: any[];
  inspectorProfiles: any[];
  companyUsers: any[];
  inspections: any[];
}) {
  const people = new Map<string, { name: string; email: string }>();

  [...profiles, ...companyUsers].forEach((row) => {
    const key = getUserKey(row);
    if (!key) return;

    people.set(key, {
      name: getUserName(row),
      email: getUserEmail(row),
    });
  });

  inspectorProfiles.forEach((row) => {
    const key = String(row?.inspector_id || row?.id || "");
    if (!key) return;

    people.set(key, {
      name: getUserName(row),
      email: getUserEmail(row),
    });
  });

  const map = new Map<string, InspectorRevenueRow>();

  inspections.forEach((inspection) => {
    const inspectorId = getInspectorId(inspection);
    if (!inspectorId) return;

    const person = people.get(inspectorId);

    if (!map.has(inspectorId)) {
      map.set(inspectorId, {
        inspectorId,
        inspectorName: person?.name || "Inspector",
        inspectorEmail: person?.email || "",
        reports: 0,
        paidReports: 0,
        revenue: 0,
        averageValue: 0,
        lastReport: null,
      });
    }

    const row = map.get(inspectorId)!;
    const date = getInspectionDate(inspection);

    row.reports += 1;

    if (isPaidInspection(inspection)) {
      row.paidReports += 1;
      row.revenue += getInspectionRevenue(inspection);
    }

    const currentTime = row.lastReport ? new Date(row.lastReport).getTime() : 0;
    const nextTime = date ? new Date(date).getTime() : 0;

    if (!Number.isNaN(nextTime) && nextTime > currentTime) {
      row.lastReport = date;
    }
  });

  return [...map.values()]
    .map((row) => ({
      ...row,
      averageValue: row.paidReports > 0 ? Math.round(row.revenue / row.paidReports) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.reports - a.reports);
}

function countRevenueByMonth(inspections: any[]) {
  const map = new Map<string, { month: string; revenue: number; reports: number; paidReports: number }>();

  inspections.forEach((inspection) => {
    const date = getInspectionDate(inspection);
    const key = getMonthKey(date);

    if (key === "No Date") return;

    if (!map.has(key)) {
      map.set(key, { month: key, revenue: 0, reports: 0, paidReports: 0 });
    }

    const row = map.get(key)!;
    row.reports += 1;

    if (isPaidInspection(inspection)) {
      row.paidReports += 1;
      row.revenue += getInspectionRevenue(inspection);
    }
  });

  return [...map.values()].slice(-12);
}

function countRevenueByDay(inspections: any[]) {
  const map = new Map<string, { day: string; revenue: number; reports: number }>();

  inspections.forEach((inspection) => {
    const date = getInspectionDate(inspection);
    const key = getDayKey(date);

    if (key === "No Date") return;

    if (!map.has(key)) {
      map.set(key, { day: key, revenue: 0, reports: 0 });
    }

    const row = map.get(key)!;
    row.reports += 1;

    if (isPaidInspection(inspection)) {
      row.revenue += getInspectionRevenue(inspection);
    }
  });

  return [...map.values()].slice(-14);
}

export default async function OwnerRevenuePage() {
  const userClient = await createUserClient();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = String(user.email || "").toLowerCase();

  if (!OWNER_EMAILS.includes(userEmail)) {
    return (
      <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/40 bg-red-950/20 p-8 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-red-300">
            Owner Only
          </p>
          <h1 className="mt-4 text-4xl font-black">Access Restricted</h1>
          <p className="mt-4 text-slate-300">
            This revenue dashboard is only available to the FLOW owner account.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-red-400 px-5 py-3 font-black text-red-300 hover:bg-red-500/10"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

  const [
    inspectionsRaw,
    invoices,
    radonTests,
    moldTests,
    profiles,
    inspectorProfiles,
    companyUsers,
  ] = await Promise.all([
    safeSelect(admin.from("inspections").select("*"), "inspections"),
    safeSelect(admin.from("invoices").select("*"), "invoices"),
    safeSelect(admin.from("radon_tests").select("*"), "radon_tests"),
    safeSelect(admin.from("mold_tests").select("*"), "mold_tests"),
    safeSelect(admin.from("profiles").select("*"), "profiles"),
    safeSelect(admin.from("inspector_profiles").select("*"), "inspector_profiles"),
    safeSelect(admin.from("company_users").select("*"), "company_users"),
  ]);

  const inspections = inspectionsRaw.filter((inspection: any) => inspection?.is_demo !== true);
  const paidInspections = inspections.filter(isPaidInspection);
  const openInvoices = invoices.filter(isOpenInvoice);
  const paidInvoices = invoices.filter(isPaidInvoice);

  const revenue = paidInspections.reduce(
    (sum: number, inspection: any) => sum + getInspectionRevenue(inspection),
    0
  );

  const revenueThisMonth = paidInspections
    .filter((inspection: any) => isThisMonth(getInspectionDate(inspection), now))
    .reduce((sum: number, inspection: any) => sum + getInspectionRevenue(inspection), 0);

  const revenue7 = paidInspections
    .filter((inspection: any) => isAfter(getInspectionDate(inspection), sevenDaysAgo))
    .reduce((sum: number, inspection: any) => sum + getInspectionRevenue(inspection), 0);

  const revenue30 = paidInspections
    .filter((inspection: any) => isAfter(getInspectionDate(inspection), thirtyDaysAgo))
    .reduce((sum: number, inspection: any) => sum + getInspectionRevenue(inspection), 0);

  const outstandingInvoiceTotal = openInvoices.reduce(
    (sum: number, invoice: any) => sum + Math.max(0, getInvoiceAmount(invoice) - getInvoicePaidAmount(invoice)),
    0
  );

  const paidInvoiceTotal = paidInvoices.reduce(
    (sum: number, invoice: any) => sum + (getInvoicePaidAmount(invoice) || getInvoiceAmount(invoice)),
    0
  );

  const projectedRevenue = inspections
    .filter((inspection: any) => !isPaidInspection(inspection))
    .reduce((sum: number, inspection: any) => sum + getInspectionPrice(inspection), 0);

  const averagePaidReport =
    paidInspections.length > 0 ? Math.round(revenue / paidInspections.length) : 0;

  const averageAllReports =
    inspections.length > 0
      ? Math.round(
          inspections.reduce((sum: number, inspection: any) => sum + getInspectionPrice(inspection), 0) /
            inspections.length
        )
      : 0;

  const radonRevenue = getServiceRevenue(radonTests);
  const moldRevenue = getServiceRevenue(moldTests);

  const inspectorRows = buildInspectorRows({
    profiles,
    inspectorProfiles,
    companyUsers,
    inspections,
  });

  const monthlyRows = countRevenueByMonth(inspections);
  const dailyRows = countRevenueByDay(
    inspections.filter((inspection: any) =>
      isAfter(getInspectionDate(inspection), thirtyDaysAgo)
    )
  );

  const maxMonthlyRevenue = Math.max(1, ...monthlyRows.map((row) => row.revenue));
  const maxMonthlyReports = Math.max(1, ...monthlyRows.map((row) => row.reports));
  const maxDailyRevenue = Math.max(1, ...dailyRows.map((row) => row.revenue));

  const recentPaidReports = paidInspections
    .sort(
      (a: any, b: any) =>
        new Date(getInspectionDate(b)).getTime() - new Date(getInspectionDate(a)).getTime()
    )
    .slice(0, 15);

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-green-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-green-400">
                Owner Revenue Dashboard
              </p>
              <h1 className="mt-4 text-5xl font-black text-white">
                Revenue, Invoices & Business Growth
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Owner-only revenue center for paid reports, monthly trends, inspector production, invoices, service add-ons, and projected income.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/owner/users"
                className="rounded-xl border border-cyan-500 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-500/10"
              >
                👥 Users
              </Link>

              <Link
                href="/dashboard/owner/devices"
                className="rounded-xl border border-purple-500 px-5 py-3 font-black text-purple-300 transition hover:bg-purple-500/10"
              >
                📱 Devices
              </Link>

              <Link
                href="/dashboard/owner"
                className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Owner Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Revenue" value={money(revenue)} helper={`${paidInspections.length} paid reports detected.`} tone="green" />
          <MetricCard label="This Month" value={money(revenueThisMonth)} helper="Revenue from paid reports this month." tone="teal" />
          <MetricCard label="Last 30 Days" value={money(revenue30)} helper={`${money(revenue7)} in the last 7 days.`} tone="blue" />
          <MetricCard label="Average Paid Report" value={money(averagePaidReport)} helper={`${money(averageAllReports)} average listed report value.`} tone="purple" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Outstanding Invoices" value={money(outstandingInvoiceTotal)} helper={`${openInvoices.length} open invoice records.`} tone="orange" />
          <MetricCard label="Paid Invoices" value={money(paidInvoiceTotal)} helper={`${paidInvoices.length} paid invoice records.`} tone="green" />
          <MetricCard label="Projected Revenue" value={money(projectedRevenue)} helper="Estimated unpaid report value." tone="yellow" />
          <MetricCard label="Reports Created" value={String(inspections.length)} helper={`${paidInspections.length} paid / completed.`} tone="blue" />
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Radon Revenue" value={money(radonRevenue)} helper={`${radonTests.length} radon test records.`} tone="purple" />
          <MetricCard label="Mold Revenue" value={money(moldRevenue)} helper={`${moldTests.length} mold test records.`} tone="teal" />
          <MetricCard label="Inspectors Producing" value={String(inspectorRows.filter((row) => row.reports > 0).length)} helper="Inspectors with report activity." tone="green" />
          <MetricCard label="Top Inspector" value={inspectorRows[0]?.inspectorName || "N/A"} helper={inspectorRows[0] ? `${money(inspectorRows[0].revenue)} • ${inspectorRows[0].reports} reports` : "No inspector revenue yet."} tone="orange" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Monthly Revenue Trend" subtitle="Paid revenue and report volume by month.">
            {monthlyRows.length === 0 ? (
              <EmptyState text="No monthly revenue data yet." />
            ) : (
              <div className="space-y-5">
                {monthlyRows.map((row) => (
                  <div key={row.month} className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <p className="font-black text-white">{row.month}</p>
                      <p className="text-sm font-black text-green-300">{money(row.revenue)}</p>
                    </div>

                    <GrowthBar label="Revenue" value={row.revenue} max={maxMonthlyRevenue} tone="green" display={money(row.revenue)} />
                    <GrowthBar label="Reports" value={row.reports} max={maxMonthlyReports} tone="blue" display={`${row.reports}`} />
                    <GrowthBar label="Paid Reports" value={row.paidReports} max={maxMonthlyReports} tone="teal" display={`${row.paidReports}`} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Daily Revenue Activity" subtitle="Last 30 days grouped by day.">
            {dailyRows.length === 0 ? (
              <EmptyState text="No daily revenue data yet." />
            ) : (
              <div className="space-y-3">
                {dailyRows.map((row) => (
                  <SimpleBar
                    key={row.day}
                    label={row.day}
                    value={money(row.revenue)}
                    count={`${row.reports} report${row.reports === 1 ? "" : "s"}`}
                    width={Math.max(4, Math.round((row.revenue / maxDailyRevenue) * 100))}
                  />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Revenue by Inspector" subtitle="Inspector production ranked by paid revenue.">
            {inspectorRows.length === 0 ? (
              <EmptyState text="No inspector revenue data yet." />
            ) : (
              <div className="space-y-3">
                {inspectorRows.slice(0, 12).map((row) => (
                  <InspectorRevenueCard key={row.inspectorId} row={row} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent Paid Reports" subtitle="Most recent reports detected as paid or completed.">
            {recentPaidReports.length === 0 ? (
              <EmptyState text="No paid reports detected yet." />
            ) : (
              <div className="space-y-3">
                {recentPaidReports.map((inspection: any) => {
                  const address =
                    inspection?.property_address ||
                    inspection?.address ||
                    inspection?.property ||
                    `Report #${inspection?.id}`;

                  return (
                    <div
                      key={inspection.id}
                      className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{address}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            Report #{inspection?.id} • {formatDateTime(getInspectionDate(inspection))}
                          </p>
                        </div>

                        <p className="shrink-0 font-black text-green-300">
                          {money(getInspectionRevenue(inspection))}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/reports/${inspection.id}`}
                          className="rounded-lg border border-teal-500 px-3 py-2 text-xs font-black text-teal-300 transition hover:bg-teal-500/10"
                        >
                          Open Report
                        </Link>

                        <span className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-black text-green-300">
                          Paid
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <Panel title="Invoice Snapshot" subtitle="Paid, open, and outstanding invoice records.">
          {invoices.length === 0 ? (
            <EmptyState text="No invoice records found." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-[#020817] text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800 bg-[#020817]/60">
                    {invoices.slice(0, 100).map((invoice: any, index: number) => {
                      const amount = getInvoiceAmount(invoice);
                      const paid = getInvoicePaidAmount(invoice);
                      const balance = Math.max(0, amount - paid);

                      return (
                        <tr key={invoice?.id || index} className="hover:bg-slate-900/70">
                          <td className="px-4 py-4">
                            <p className="font-black text-white">
                              {invoice?.invoice_number || invoice?.id || `Invoice ${index + 1}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Report #{invoice?.inspection_id || invoice?.report_id || "N/A"}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <Badge tone={isPaidInvoice(invoice) ? "green" : "orange"}>
                              {isPaidInvoice(invoice) ? "Paid" : "Open"}
                            </Badge>
                          </td>

                          <td className="px-4 py-4 text-right font-black text-white">
                            {money(amount)}
                          </td>

                          <td className="px-4 py-4 text-right font-black text-green-300">
                            {money(paid)}
                          </td>

                          <td className="px-4 py-4 text-right font-black text-orange-300">
                            {money(balance)}
                          </td>

                          <td className="px-4 py-4 text-slate-300">
                            {formatDateTime(invoice?.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>

        <section className="rounded-2xl border border-yellow-500/30 bg-yellow-950/10 p-5 text-sm leading-6 text-yellow-100">
          <strong>Revenue note:</strong> This dashboard uses your internal Supabase report, invoice, radon, and mold records. Stripe should still be treated as the official payment ledger for reconciliation.
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
}) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/40 bg-teal-950/20 text-teal-300",
    green: "border-green-500/40 bg-green-950/20 text-green-300",
    blue: "border-blue-500/40 bg-blue-950/20 text-blue-300",
    purple: "border-purple-500/40 bg-purple-950/20 text-purple-300",
    orange: "border-orange-500/40 bg-orange-950/20 text-orange-300",
    yellow: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300",
    red: "border-red-500/40 bg-red-950/20 text-red-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${classes[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
      <h2 className="text-2xl font-black text-teal-300">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">
      {text}
    </div>
  );
}

function GrowthBar({
  label,
  value,
  max,
  tone,
  display,
}: {
  label: string;
  value: number;
  max: number;
  tone: "teal" | "blue" | "green";
  display?: string;
}) {
  const width = Math.max(4, Math.round(((value || 0) / Math.max(1, max)) * 100));
  const color =
    tone === "green"
      ? "bg-green-400"
      : tone === "blue"
        ? "bg-blue-400"
        : "bg-teal-400";

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-bold text-slate-300">{label}</span>
        <span className="text-slate-400">{display || value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#020617]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function SimpleBar({
  label,
  value,
  count,
  width,
}: {
  label: string;
  value: string;
  count: string;
  width: number;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <p className="font-black text-white">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{count}</p>
        </div>
        <p className="font-black text-green-300">{value}</p>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-900">
        <div className="h-full rounded-full bg-green-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function InspectorRevenueCard({ row }: { row: InspectorRevenueRow }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-black text-white">{row.inspectorName}</p>
          <p className="mt-1 truncate text-sm text-slate-400">
            {row.inspectorEmail || "No email"}
          </p>
        </div>

        <p className="shrink-0 font-black text-green-300">{money(row.revenue)}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Reports" value={String(row.reports)} />
        <MiniStat label="Paid" value={String(row.paidReports)} />
        <MiniStat label="Avg" value={money(row.averageValue)} />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Last report: {formatDateTime(row.lastReport)}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-[#020617] p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-black text-white">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: Tone;
}) {
  const classes: Record<Tone, string> = {
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    green: "border-green-500/30 bg-green-500/10 text-green-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-black ${classes[tone]}`}>
      {children}
    </span>
  );
}
