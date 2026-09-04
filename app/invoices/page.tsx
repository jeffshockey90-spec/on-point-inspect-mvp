
import { formatAppValue } from "../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import InvoicePaymentButton from "../../components/InvoicePaymentButton";
import InvoiceReminderButton from "../../components/InvoiceReminderButton";
import { formatUsd } from "../../lib/currency";
import { resolveInspectionAccessFilter } from "../../lib/inspectionAccess";

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
  return formatUsd(getNumber(value));
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
  const value = inspection?.balance_due;
  if (value !== null && value !== undefined) {
    return Math.max(0, getNumber(value));
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

  return formatAppValue(date, {
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

  const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .eq(accessFilter.column, accessFilter.value)
    .order("created_at", { ascending: false });

  // Custom line-item invoices live in a separate `invoices` table. It may not
  // exist yet (migration not run), and RLS scopes rows to the creator, so read
  // defensively: any error (incl. missing table) just yields an empty list.
  const { data: customInvoiceRows, error: customInvoicesError } = await supabase
    .from("invoices")
    .select("*")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });
  const customInvoices = customInvoicesError ? [] : customInvoiceRows || [];

  if (error) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-8 text-[var(--fl-text)]">
        <h1 className="text-3xl font-semibold text-[var(--fl-crit-text)]">
          Error loading invoices
        </h1>
        <p className="mt-4 text-[var(--fl-muted)]">{error.message}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)]"
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
    <main className="min-h-screen bg-[var(--fl-ground)] px-6 py-10 text-[var(--fl-text)]">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-8 shadow-2xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                FLOW
              </p>

              <h1 className="mt-4 text-5xl font-semibold text-[var(--fl-text)]">
                Invoices
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--fl-muted)]">
                Track paid, unpaid, waived, overdue, and outstanding inspection
                balances without touching the report workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/invoices/new"
                className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400"
              >
                + New Invoice
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Outstanding" value={money(outstandingBalance)} helper="Total unpaid balance" tone="red" />
          <MetricCard label="Paid" value={String(paidInvoices.length)} helper="Fully paid invoices" tone="green" />
          <MetricCard label="Unpaid / Partial" value={String(unpaidInvoices.length)} helper="Invoices needing payment" tone="orange" />
          <MetricCard label="Overdue" value={String(overdueInvoices.length)} helper="Past due invoices" tone="yellow" />
          <MetricCard label="Waived" value={String(waivedInvoices.length)} helper="Payment waived" tone="blue" />
        </section>

        {customInvoices.length > 0 && (
          <section className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Custom Invoices</h2>
                <p className="mt-1 text-sm text-[var(--fl-muted)]">
                  Line-item invoices you built and can send with an online pay link.
                </p>
              </div>
              <Link
                href="/invoices/new"
                className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
              >
                + New Invoice
              </Link>
            </div>

            <div className="space-y-3">
              {customInvoices.map((inv: any) => {
                const status = String(inv.status || "draft").toLowerCase();
                const statusTone =
                  status === "paid"
                    ? "bg-emerald-500/15 text-[var(--fl-good-text)]"
                    : status === "sent"
                      ? "bg-cyan-500/15 text-[var(--fl-info-text)]"
                      : "bg-slate-600/20 text-[var(--fl-muted)]";
                return (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[var(--fl-text)]">
                        {inv.client_name || inv.client_email || "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
                        {inv.invoice_number ? `${inv.invoice_number} · ` : ""}
                        {formatAppValue(inv.created_at, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusTone}`}>
                        {status}
                      </span>
                      <span className="font-semibold text-[var(--fl-text)] [font-variant-numeric:tabular-nums]">
                        {money(inv.total)}
                      </span>
                      <Link
                        href={`/invoices/${inv.id}/edit`}
                        className="whitespace-nowrap rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
                      >
                        {status === "paid" ? "View" : "Edit / Send"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
                Invoice List
              </h2>
              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Pulls directly from the inspections table payment fields.
              </p>
            </div>

            <p className="text-sm font-bold text-[var(--fl-muted)]">
              {invoiceRows.length} invoice{invoiceRows.length === 1 ? "" : "s"}
            </p>
          </div>

          {invoiceRows.length === 0 ? (
            <div className="mt-6 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-[var(--fl-muted)]">
              No invoices found yet.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--fl-line)] text-left text-xs uppercase tracking-wide text-[var(--fl-muted)]">
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Property</th>
                    <th className="py-3 pr-4">Client</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Invoice</th>
                    <th className="py-3 pr-4">Paid</th>
                    <th className="py-3 pr-4">Balance</th>
                    <th className="py-3 pr-4">Method</th>
                    <th className="py-3 pr-4">Due</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {invoiceRows.map((inspection: any) => {
                    const canPay =
                      inspection.balanceDue > 0 &&
                      inspection.invoiceStatus !== "Paid" &&
                      inspection.invoiceStatus !== "Waived";

                    return (
                      <tr key={inspection.id} className="border-b border-[var(--fl-raised)] text-sm">
                        <td className="py-4 pr-4">
                          <InvoiceStatusBadge status={inspection.invoiceStatus} overdue={inspection.overdue} />
                        </td>

                        <td className="py-4 pr-4">
                          <p className="font-bold text-[var(--fl-text)]">
                            {inspection.address || inspection.property_address || "Untitled Inspection"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--fl-faint)]">ID #{inspection.id}</p>
                        </td>

                        <td className="py-4 pr-4 text-[var(--fl-muted)]">
                          {inspection.client_name || inspection.client || "N/A"}
                        </td>

                        <td className="py-4 pr-4 text-[var(--fl-muted)]">
                          {inspection.inspection_type || "Inspection"}
                        </td>

                        <td className="py-4 pr-4 font-bold text-[var(--fl-text)]">{money(inspection.invoiceAmount)}</td>
                        <td className="py-4 pr-4 text-[var(--fl-good-text)]">{money(inspection.amountPaid)}</td>
                        <td className="py-4 pr-4 font-bold text-[var(--fl-crit-text)]">{money(inspection.balanceDue)}</td>
                        <td className="py-4 pr-4 text-[var(--fl-muted)]">{inspection.payment_method || "N/A"}</td>
                        <td className="py-4 pr-4 text-[var(--fl-muted)]">{formatDate(inspection.invoice_due_date)}</td>

                        <td className="py-4 pr-4">
                          <div className="flex max-w-[260px] flex-wrap gap-2">
                            {canPay && (
                              <>
                                <InvoicePaymentButton inspectionId={inspection.id} />
                                <InvoiceReminderButton inspectionId={inspection.id} />
                              </>
                            )}

                            <Link
                              href={`/invoices/${inspection.id}/print`}
                              className="inline-flex rounded-lg border border-cyan-500 px-3 py-2 text-xs font-semibold text-[var(--fl-info-text)] transition hover:bg-cyan-500/10"
                            >
                              Invoice PDF
                            </Link>

                            <Link
                              href={`/reports/${inspection.id}`}
                              className="inline-flex rounded-lg border border-teal-500 px-3 py-2 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
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
    green: "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]",
    teal: "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]",
    blue: "border-blue-500/40 bg-blue-500/10 text-[var(--fl-info-text)]",
    purple: "border-purple-500/40 bg-purple-500/10 text-[var(--fl-purple-text)]",
    orange: "border-orange-500/40 bg-orange-500/10 text-[var(--fl-warn-text)]",
    yellow: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
    red: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-xl ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">{helper}</p>
    </div>
  );
}

function InvoiceStatusBadge({ status, overdue }: { status: string; overdue: boolean }) {
  if (overdue) {
    return (
      <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-[var(--fl-crit-text)]">
        Overdue
      </span>
    );
  }

  const styles: Record<string, string> = {
    Paid: "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]",
    Unpaid: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
    Partial: "border-orange-500/40 bg-orange-500/10 text-[var(--fl-warn-text)]",
    Waived: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[status] || "border-[var(--fl-faint)] bg-slate-500/10 text-[var(--fl-muted)]"}`}>
      {status}
    </span>
  );
}
