import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
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
    calculatePriceFromSqft(inspection?.square_feet || inspection?.sqft) ||
    0
  );
}

function getPaidAmount(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getBalanceDue(inspection: any) {
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    return getNumber(inspection.balance_due);
  }

  return Math.max(0, getInspectionPrice(inspection) - getPaidAmount(inspection));
}

function money(value: any) {
  const amount = getNumber(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function isSameMonth(dateValue: any, now = new Date()) {
  if (!dateValue) return false;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function getDateValue(inspection: any) {
  return inspection?.inspection_date || inspection?.created_at || "";
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || ""
  ).toLowerCase();

  if (status === "paid" || status === "waived") return true;

  const price = getInspectionPrice(inspection);
  const paid = getPaidAmount(inspection);
  const balance = getBalanceDue(inspection);

  if (price > 0 && paid >= price) return true;
  if (paid > 0 && balance <= 0) return true;

  return false;
}

function isAgreementSigned(inspection: any) {
  const status = String(
    inspection?.agreement_status || inspection?.agreement_state || ""
  ).toLowerCase();

  return (
    status === "signed" ||
    status === "complete" ||
    status === "completed" ||
    status === "accepted" ||
    inspection?.agreement_signed === true ||
    inspection?.signed_agreement === true
  );
}

function isReportPublished(inspection: any) {
  const reportStatus = String(inspection?.report_status || "").toLowerCase();
  const status = String(inspection?.status || "").toLowerCase();

  return (
    inspection?.published === true ||
    inspection?.is_published === true ||
    inspection?.report_published === true ||
    reportStatus === "published" ||
    reportStatus === "ready" ||
    status === "published" ||
    status === "ready"
  );
}

function getMonthKey(dateValue: any) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "No Date";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function formatDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getServiceType(inspection: any) {
  const raw = String(
    inspection?.inspection_type ||
      inspection?.service_type ||
      inspection?.type ||
      ""
  ).toLowerCase();

  const hasRadon =
    raw.includes("radon") ||
    inspection?.radon === true ||
    inspection?.radon_test === true ||
    inspection?.radon_testing === true;

  const hasMold =
    raw.includes("mold") ||
    inspection?.mold === true ||
    inspection?.mold_test === true ||
    inspection?.mold_testing === true;

  if (hasRadon && hasMold) return "Home + Radon + Mold";
  if (hasRadon) return "Home + Radon";
  if (hasMold) return "Home + Mold";
  if (raw.includes("maintenance")) return "Maintenance";
  if (raw.includes("seller") || raw.includes("pre-list")) return "Seller";
  if (raw.includes("new construction")) return "New Construction";
  if (raw.includes("radon")) return "Radon";
  if (raw.includes("mold")) return "Mold";

  return inspection?.inspection_type || "Home Inspection";
}

function getRevenueValue(inspection: any) {
  if (isPaymentComplete(inspection)) {
    return getPaidAmount(inspection) || getInspectionPrice(inspection);
  }

  return 0;
}

function getDaysOutstanding(inspection: any) {
  const dateValue =
    inspection?.invoice_due_date ||
    inspection?.inspection_date ||
    inspection?.created_at;

  if (!dateValue) return 0;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 0;

  const diff = Date.now() - date.getTime();

  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        <h1 className="text-3xl font-bold text-red-400">
          Error loading analytics
        </h1>
        <p className="mt-4 text-slate-300">{error.message}</p>
      </main>
    );
  }

  const rows = inspections || [];
  const now = new Date();

  const inspectionsThisMonth = rows.filter((inspection: any) =>
    isSameMonth(getDateValue(inspection), now)
  );

  const paidRows = rows.filter(isPaymentComplete);
  const paidThisMonth = inspectionsThisMonth.filter(isPaymentComplete);

  const revenueAllTime = paidRows.reduce(
    (sum: number, inspection: any) =>
      sum + (getPaidAmount(inspection) || getInspectionPrice(inspection)),
    0
  );

  const revenueThisMonth = paidThisMonth.reduce(
    (sum: number, inspection: any) =>
      sum + (getPaidAmount(inspection) || getInspectionPrice(inspection)),
    0
  );

  const quotedAllTime = rows.reduce(
    (sum: number, inspection: any) => sum + getInspectionPrice(inspection),
    0
  );

  const outstandingBalance = rows.reduce(
    (sum: number, inspection: any) => sum + getBalanceDue(inspection),
    0
  );

  const averageInspectionFee =
    rows.length > 0 ? quotedAllTime / rows.length : 0;

  const paymentsPending = rows.filter(
    (inspection: any) => !isPaymentComplete(inspection) && getBalanceDue(inspection) > 0
  );

  const agreementsPending = rows.filter((inspection: any) => !isAgreementSigned(inspection));

  const reportsPendingPublish = rows.filter(
    (inspection: any) => !isReportPublished(inspection)
  );

  const readyToDeliver = rows.filter(
    (inspection: any) =>
      isAgreementSigned(inspection) &&
      isPaymentComplete(inspection) &&
      isReportPublished(inspection)
  );

  const monthMap: Record<string, { revenue: number; count: number }> = {};

  rows.forEach((inspection: any) => {
    const key = getMonthKey(getDateValue(inspection));
    if (!monthMap[key]) monthMap[key] = { revenue: 0, count: 0 };

    monthMap[key].count += 1;

    if (isPaymentComplete(inspection)) {
      monthMap[key].revenue +=
        getPaidAmount(inspection) || getInspectionPrice(inspection);
    }
  });

  const monthlyRows = Object.entries(monthMap)
    .filter(([month]) => month !== "No Date")
    .map(([month, values]) => ({
      month,
      ...values,
    }))
    .reverse()
    .slice(-6);

  const maxMonthlyRevenue = Math.max(
    1,
    ...monthlyRows.map((row) => row.revenue)
  );

  const realtorMap: Record<string, { count: number; revenue: number }> = {};

  rows.forEach((inspection: any) => {
    const realtor =
      inspection?.realtor_name ||
      inspection?.agent_name ||
      inspection?.realtor_email ||
      "No Realtor Listed";

    if (!realtorMap[realtor]) realtorMap[realtor] = { count: 0, revenue: 0 };

    realtorMap[realtor].count += 1;

    if (isPaymentComplete(inspection)) {
      realtorMap[realtor].revenue +=
        getPaidAmount(inspection) || getInspectionPrice(inspection);
    }
  });

  const topRealtors = Object.entries(realtorMap)
    .map(([name, values]) => ({
      name,
      ...values,
    }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 8);

  const topRealtorsByRevenue = Object.entries(realtorMap)
    .map(([name, values]) => ({
      name,
      ...values,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 8);

  const serviceTypeMap: Record<
    string,
    { count: number; revenue: number; quoted: number }
  > = {};

  rows.forEach((inspection: any) => {
    const type = getServiceType(inspection);

    if (!serviceTypeMap[type]) {
      serviceTypeMap[type] = { count: 0, revenue: 0, quoted: 0 };
    }

    serviceTypeMap[type].count += 1;
    serviceTypeMap[type].quoted += getInspectionPrice(inspection);
    serviceTypeMap[type].revenue += getRevenueValue(inspection);
  });

  const serviceTypeRows = Object.entries(serviceTypeMap)
    .map(([type, values]) => ({
      type,
      ...values,
      percentage: rows.length > 0 ? Math.round((values.count / rows.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  const maxServiceCount = Math.max(
    1,
    ...serviceTypeRows.map((row) => row.count)
  );

  const maxServiceRevenue = Math.max(
    1,
    ...serviceTypeRows.map((row) => row.revenue)
  );

  const averageMonthlyRevenue =
    monthlyRows.length > 0
      ? monthlyRows.reduce((sum, row) => sum + row.revenue, 0) /
        monthlyRows.length
      : 0;

  const outstandingInvoices = rows
    .map((inspection: any) => ({
      ...inspection,
      invoiceAmount: getInspectionPrice(inspection),
      amountPaid: getPaidAmount(inspection),
      balanceDue: getBalanceDue(inspection),
      daysOutstanding: getDaysOutstanding(inspection),
    }))
    .filter((inspection: any) => !isPaymentComplete(inspection) && inspection.balanceDue > 0)
    .sort((a: any, b: any) => b.balanceDue - a.balanceDue)
    .slice(0, 10);

  const recentInspections = rows.slice(0, 8);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-slate-800 bg-[#0f172a] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                On Point Inspect
              </p>

              <h1 className="mt-4 text-5xl font-black text-white">
                Analytics Dashboard
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Track revenue, inspections, payments, agreements, publishing, and realtor referrals.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Revenue This Month"
            value={money(revenueThisMonth)}
            helper={`${paidThisMonth.length} paid inspection${paidThisMonth.length === 1 ? "" : "s"}`}
            tone="green"
          />

          <MetricCard
            label="Revenue All Time"
            value={money(revenueAllTime)}
            helper={`${paidRows.length} paid inspection${paidRows.length === 1 ? "" : "s"}`}
            tone="teal"
          />

          <MetricCard
            label="Inspections This Month"
            value={String(inspectionsThisMonth.length)}
            helper={`${rows.length} total inspection${rows.length === 1 ? "" : "s"}`}
            tone="blue"
          />

          <MetricCard
            label="Average Inspection Fee"
            value={money(averageInspectionFee)}
            helper="Uses saved price; falls back to sq ft pricing."
            tone="purple"
          />

          <MetricCard
            label="Avg Monthly Revenue"
            value={money(averageMonthlyRevenue)}
            helper="Based on displayed monthly revenue data."
            tone="teal"
          />

          <MetricCard
            label="Payments Pending"
            value={String(paymentsPending.length)}
            helper={`${money(outstandingBalance)} outstanding`}
            tone="orange"
          />

          <MetricCard
            label="Agreements Pending"
            value={String(agreementsPending.length)}
            helper="Inspections missing signed agreement."
            tone="yellow"
          />

          <MetricCard
            label="Reports Pending Publish"
            value={String(reportsPendingPublish.length)}
            helper="Draft or unpublished reports."
            tone="red"
          />

          <MetricCard
            label="Ready / Delivered"
            value={String(readyToDeliver.length)}
            helper="Signed, paid, and published."
            tone="green"
          />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel title="Monthly Revenue" subtitle="Paid revenue by inspection month.">
            {monthlyRows.length === 0 ? (
              <EmptyState text="No monthly revenue data yet." />
            ) : (
              <div className="space-y-4">
                {monthlyRows.map((row) => {
                  const width = Math.max(4, Math.round((row.revenue / maxMonthlyRevenue) * 100));

                  return (
                    <div key={row.month}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="font-bold text-white">{row.month}</span>
                        <span className="text-slate-300">{money(row.revenue)}</span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[#020617]">
                        <div
                          className="h-full rounded-full bg-teal-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Inspection Volume" subtitle="Inspection count by month.">
            {monthlyRows.length === 0 ? (
              <EmptyState text="No inspection volume data yet." />
            ) : (
              <div className="space-y-4">
                {monthlyRows.map((row) => {
                  const maxCount = Math.max(1, ...monthlyRows.map((item) => item.count));
                  const width = Math.max(4, Math.round((row.count / maxCount) * 100));

                  return (
                    <div key={row.month}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="font-bold text-white">{row.month}</span>
                        <span className="text-slate-300">
                          {row.count} inspection{row.count === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[#020617]">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel title="Top Referring Realtors" subtitle="Ranked by inspection count.">
            {topRealtors.length === 0 ? (
              <EmptyState text="No realtor referral data yet." />
            ) : (
              <div className="space-y-3">
                {topRealtors.map((realtor, index) => (
                  <div
                    key={realtor.name}
                    className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-teal-300">
                          #{index + 1}
                        </p>

                        <p className="mt-1 text-lg font-bold text-white">
                          {realtor.name}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-black text-white">{realtor.count}</p>
                        <p className="text-xs text-slate-400">inspections</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-slate-400">
                      Paid Revenue: {money(realtor.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent Inspections" subtitle="Latest inspection activity.">
            {recentInspections.length === 0 ? (
              <EmptyState text="No inspections yet." />
            ) : (
              <div className="space-y-3">
                {recentInspections.map((inspection: any) => {
                  const paid = isPaymentComplete(inspection);
                  const signed = isAgreementSigned(inspection);
                  const published = isReportPublished(inspection);

                  return (
                    <Link
                      key={inspection.id}
                      href={`/reports/${inspection.id}`}
                      className="block rounded-xl border border-slate-700 bg-[#020817]/70 p-4 transition hover:border-teal-500/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-white">
                            {inspection.property_address ||
                              inspection.address ||
                              "Untitled Inspection"}
                          </p>

                          <p className="mt-1 text-sm text-slate-400">
                            {formatDate(getDateValue(inspection))} •{" "}
                            {inspection.client_name || "No client"}
                          </p>
                        </div>

                        <p className="font-black text-teal-300">
                          {money(getInspectionPrice(inspection))}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <MiniBadge label={signed ? "Signed" : "Agreement"} complete={signed} />
                        <MiniBadge label={paid ? "Paid" : "Payment"} complete={paid} />
                        <MiniBadge label={published ? "Published" : "Draft"} complete={published} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Inspection Type Analytics"
            subtitle="Inspection count and percentage by service type."
          >
            {serviceTypeRows.length === 0 ? (
              <EmptyState text="No inspection type data yet." />
            ) : (
              <div className="space-y-4">
                {serviceTypeRows.map((row) => {
                  const width = Math.max(
                    4,
                    Math.round((row.count / maxServiceCount) * 100)
                  );

                  return (
                    <div
                      key={row.type}
                      className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-white">{row.type}</span>
                        <span className="text-slate-300">
                          {row.count} inspection{row.count === 1 ? "" : "s"} •{" "}
                          {row.percentage}%
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[#020617]">
                        <div
                          className="h-full rounded-full bg-blue-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>

                      <p className="mt-3 text-sm text-slate-400">
                        Paid Revenue: {money(row.revenue)} • Quoted:{" "}
                        {money(row.quoted)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Revenue by Service Type"
            subtitle="Paid revenue grouped by inspection or add-on type."
          >
            {serviceTypeRows.length === 0 ? (
              <EmptyState text="No service revenue data yet." />
            ) : (
              <div className="space-y-4">
                {serviceTypeRows.map((row) => {
                  const width = Math.max(
                    4,
                    Math.round((row.revenue / maxServiceRevenue) * 100)
                  );

                  return (
                    <div key={row.type}>
                      <div className="mb-2 flex justify-between gap-3 text-sm">
                        <span className="font-bold text-white">{row.type}</span>
                        <span className="text-slate-300">
                          {money(row.revenue)}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-[#020617]">
                        <div
                          className="h-full rounded-full bg-green-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <Panel
            title="Top Realtors by Revenue"
            subtitle="Ranked by paid revenue generated."
          >
            {topRealtorsByRevenue.length === 0 ? (
              <EmptyState text="No realtor revenue data yet." />
            ) : (
              <div className="space-y-3">
                {topRealtorsByRevenue.map((realtor, index) => (
                  <div
                    key={realtor.name}
                    className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-teal-300">
                          #{index + 1}
                        </p>

                        <p className="mt-1 text-lg font-bold text-white">
                          {realtor.name}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-black text-green-300">
                          {money(realtor.revenue)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {realtor.count} referral
                          {realtor.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Outstanding Invoice Leaderboard"
            subtitle="Highest unpaid balances requiring follow-up."
          >
            {outstandingInvoices.length === 0 ? (
              <EmptyState text="No outstanding invoices." />
            ) : (
              <div className="space-y-3">
                {outstandingInvoices.map((inspection: any) => (
                  <Link
                    key={inspection.id}
                    href={`/invoices/${inspection.id}/print`}
                    className="block rounded-xl border border-slate-700 bg-[#020817]/70 p-4 transition hover:border-orange-500/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">
                          {inspection.property_address ||
                            inspection.address ||
                            "Untitled Inspection"}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {inspection.client_name || inspection.client || "No client"} •{" "}
                          {inspection.daysOutstanding} day
                          {inspection.daysOutstanding === 1 ? "" : "s"} outstanding
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-black text-orange-300">
                          {money(inspection.balanceDue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Invoice {money(inspection.invoiceAmount)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-black text-teal-300">
            Pricing Logic Used
          </h2>

          <p className="mt-3 leading-7 text-slate-300">
            Analytics uses the saved inspection price when available. If a price is missing, it estimates from square footage using your current pricing rule: <strong>$500 up to 2,000 sq ft</strong>, then <strong>+$50 per additional 1,000 sq ft or portion above 2,000 sq ft</strong>.
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
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "green" | "teal" | "blue" | "purple" | "orange" | "yellow" | "red";
}) {
  const colors: Record<string, string> = {
    green: "border-green-500/40 bg-green-950/20 text-green-300",
    teal: "border-teal-500/40 bg-teal-950/20 text-teal-300",
    blue: "border-blue-500/40 bg-blue-950/20 text-blue-300",
    purple: "border-purple-500/40 bg-purple-950/20 text-purple-300",
    orange: "border-orange-500/40 bg-orange-950/20 text-orange-300",
    yellow: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300",
    red: "border-red-500/40 bg-red-950/20 text-red-300",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
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

function MiniBadge({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        complete
          ? "border-green-500/40 bg-green-500/10 text-green-300"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
      }`}
    >
      {label}
    </span>
  );
}
