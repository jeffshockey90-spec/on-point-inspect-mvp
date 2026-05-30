import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import InvoicePaymentButton from "../../components/InvoicePaymentButton";
import InvoiceReminderButton from "../../components/InvoiceReminderButton";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(getNumber(value));
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    calculatePriceFromSqft(inspection?.sqft || inspection?.square_feet) ||
    0
  );
}

function getAmountPaid(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getBalanceDue(inspection: any) {
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    const storedBalance = getNumber(inspection.balance_due);

    if (storedBalance > 0) return storedBalance;
  }

  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function capitalize(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getInvoiceStatus(inspection: any) {
  const rawStatus = String(
    inspection?.invoice_status || inspection?.payment_status || ""
  ).toLowerCase();

  const balance = getBalanceDue(inspection);
  const paid = getAmountPaid(inspection);
  const amount = getInvoiceAmount(inspection);

  if (rawStatus === "paid") return "Paid";
  if (rawStatus === "waived") return "Waived";
  if (rawStatus === "partial") return "Partial";

  if (amount > 0 && paid >= amount) return "Paid";
  if (paid > 0 && balance > 0) return "Partial";
  if (balance > 0) return "Unpaid";

  return rawStatus ? capitalize(rawStatus) : "Unpaid";
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

function isOverdue(inspection: any) {
  const dueDate = inspection?.invoice_due_date;
  const status = getInvoiceStatus(inspection);

  if (!dueDate) return false;
  if (status === "Paid" || status === "Waived") return false;

  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < Date.now();
}

export default async function InvoicesPage() {
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
        <h1 className="text-3xl font-black text-red-400">
          Error loading invoices
        </h1>
        <p className="mt-4 text-slate-300">{error.message}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-300"
        >
          Back to Dashboard
        </Link>
      </main>
    );
  }

  const rows = inspections || [];

  const invoiceRows = rows.map((inspection: any) => ({
    ...inspection,
    invoiceAmount: getInvoiceAmount(inspection),
    amountPaid: getAmountPaid(inspection),
    balanceDue: getBalanceDue(inspection),
    invoiceStatus: getInvoiceStatus(inspection),
    overdue: isOverdue(inspection),
  }));

  const outstandingBalance = invoiceRows.reduce(
    (sum: number, inspection: any) => sum + inspection.balanceDue,
    0
  );

  const paidInvoices = invoiceRows.filter(
    (inspection: any) => inspection.invoiceStatus === "Paid"
  );

  const unpaidInvoices = invoiceRows.filter(
    (inspection: any) =>
      inspection.invoiceStatus === "Unpaid" ||
      inspection.invoiceStatus === "Partial"
  );

  const waivedInvoices = invoiceRows.filter(
    (inspection: any) => inspection.invoiceStatus === "Waived"
  );

  const overdueInvoices = invoiceRows.filter(
    (inspection: any) => inspection.overdue
  );

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
                Invoices
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
                Track paid, unpaid, waived, overdue, and outstanding inspection
                balances without touching the report workflow.
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

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Outstanding"
            value={money(outstandingBalance)}
            helper="Total unpaid balance"
            tone="red"
          />

          <MetricCard
            label="Paid"
            value={String(paidInvoices.length)}
            helper="Fully paid invoices"
            tone="green"
          />

          <MetricCard
            label="Unpaid / Partial"
            value={String(unpaidInvoices.length)}
            helper="Invoices needing payment"
            tone="orange"
          />

          <MetricCard
            label="Overdue"
            value={String(overdueInvoices.length)}
            helper="Past due invoices"
            tone="yellow"
          />

          <MetricCard
            label="Waived"
            value={String(waivedInvoices.length)}
            helper="Payment waived"
            tone="blue"
          />
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-teal-300">
                Invoice List
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Pulls directly from the inspections table payment fields.
              </p>
            </div>

            <p className="text-sm font-bold text-slate-400">
              {invoiceRows.length} invoice{invoiceRows.length === 1 ? "" : "s"}
            </p>
          </div>

          {invoiceRows.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-700 bg-[#020817]/70 p-8 text-center text-slate-400">
              No invoices found yet.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-3 pr-3">Status</th>
                    <th className="py-3 pr-3">Property</th>
                    <th className="py-3 pr-3">Client</th>
                    <th className="py-3 pr-3">Type</th>
                    <th className="py-3 pr-3">Invoice</th>
                    <th className="py-3 pr-3">Paid</th>
                    <th className="py-3 pr-3">Balance</th>
                    <th className="py-3 pr-3">Method</th>
                    <th className="py-3 pr-3">Due</th>
                    <th className="py-3 pl-2 text-left">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {invoiceRows.map((inspection: any) => {
                    const canPay =
                      inspection.balanceDue > 0 &&
                      inspection.invoiceStatus !== "Paid" &&
                      inspection.invoiceStatus !== "Waived";

                    return (
                      <tr
                        key={inspection.id}
                        className="border-b border-slate-800 text-sm"
                      >
                        <td className="py-4 pr-3">
                          <InvoiceStatusBadge
                            status={inspection.invoiceStatus}
                            overdue={inspection.overdue}
                          />
                        </td>

                        <td className="py-4 pr-3">
                          <p className="font-bold text-white">
                            {inspection.address ||
                              inspection.property_address ||
                              "Untitled Inspection"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            ID #{inspection.id}
                          </p>
                        </td>

                        <td className="py-4 pr-3 text-slate-300">
                          {inspection.client_name || inspection.client || "N/A"}
                        </td>

                        <td className="py-4 pr-3 text-slate-300">
                          {inspection.inspection_type || "Inspection"}
                        </td>

                        <td className="py-4 pr-3 font-bold text-white">
                          {money(inspection.invoiceAmount)}
                        </td>

                        <td className="py-4 pr-3 text-green-300">
                          {money(inspection.amountPaid)}
                        </td>

                        <td className="py-4 pr-3 font-bold text-red-300">
                          {money(inspection.balanceDue)}
                        </td>

                        <td className="py-4 pr-3 text-slate-300">
                          {inspection.payment_method || "N/A"}
                        </td>

                        <td className="py-4 pr-3 text-slate-300">
                          {formatDate(inspection.invoice_due_date)}
                        </td>

                        <td className="py-4 pl-2">
                          <div className="flex max-w-[260px] flex-wrap gap-2">
                            {canPay && (
                              <>
                                <InvoicePaymentButton
                                  inspectionId={inspection.id}
                                />

                                <InvoiceReminderButton
                                  inspectionId={inspection.id}
                                />
                              </>
                            )}

                            <Link
                              href={`/reports/${inspection.id}`}
                              className="inline-flex rounded-lg border border-teal-500 px-3 py-2 text-xs font-black text-teal-300 transition hover:bg-teal-500/10"
                            >
                              View Report
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

function InvoiceStatusBadge({
  status,
  overdue,
}: {
  status: string;
  overdue: boolean;
}) {
  if (overdue) {
    return (
      <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-black text-red-300">
        Overdue
      </span>
    );
  }

  const styles: Record<string, string> = {
    Paid: "border-green-500/40 bg-green-500/10 text-green-300",
    Unpaid: "border-red-500/40 bg-red-500/10 text-red-300",
    Partial: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    Waived: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        styles[status] || "border-slate-500/40 bg-slate-500/10 text-slate-300"
      }`}
    >
      {status}
    </span>
  );
}
