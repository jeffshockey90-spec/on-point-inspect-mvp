
import { formatAppValue } from "../../../../lib/app-time";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import InvoicePrintButton from "../../../../components/InvoicePrintButton";
import { getCompanyBrandingById } from "../../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";

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
    const value = getNumber(inspection.balance_due);
    if (value > 0) return value;
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

  // Bare "YYYY-MM-DD" (inspection date, due date) parsed with new Date() reads as
  // UTC midnight and can render as the previous day; anchor date-only at UTC noon.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function today() {
  return formatAppValue(new Date(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspection, error } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq(accessFilter.column, accessFilter.value)
    .single();

  if (error || !inspection) {
    return (
      <main className="min-h-screen bg-white p-10 text-slate-950">
        <h1 className="text-3xl font-black text-red-700">Invoice not found</h1>
        <p className="mt-4 text-slate-700">
          This invoice could not be loaded or you do not have access to it.
        </p>
        <Link href="/invoices" className="mt-6 inline-block font-bold text-teal-700">
          Back to Invoices
        </Link>
      </main>
    );
  }

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getAmountPaid(inspection);
  const balanceDue = getBalanceDue(inspection);
  const status = getInvoiceStatus(inspection);
  const property =
    inspection.address || inspection.property_address || "Inspection Property";
  const clientName = inspection.client_name || inspection.client || "Client";
  const invoiceNumber = inspection.invoice_number || `INV-${inspection.id}`;
  const branding = await getCompanyBrandingById(inspection.company_id);

  return (
    <main className="min-h-screen bg-slate-200 px-4 py-8 text-slate-950 print:bg-white print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: white !important; }
        }
      `}</style>

      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 print:hidden">
          <Link
            href="/invoices"
            className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-100"
          >
            Back to Invoices
          </Link>
          <InvoicePrintButton />
        </div>

        <section className="flex flex-wrap items-start justify-between gap-8 border-b-4 border-teal-500 pb-8">
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-teal-500 bg-[var(--fl-ground)]">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-black text-[var(--fl-accent-text)]">
                  {branding.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-teal-700">
                {branding.name}
              </p>
              <h1 className="mt-2 text-4xl font-black text-slate-950">
                Invoice
              </h1>
              {(branding.website || branding.email) && (
                <p className="mt-2 text-sm text-slate-600">
                  {branding.website || branding.email}
                </p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Invoice Number
            </p>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {invoiceNumber}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Created: {formatDate(inspection.created_at) || today()}
            </p>
            <p className="text-sm text-slate-600">
              Due: {formatDate(inspection.invoice_due_date)}
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Bill To
            </p>
            <p className="mt-3 text-xl font-black text-slate-950">
              {clientName}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {inspection.client_email || "No client email listed"}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {inspection.client_phone || "No phone listed"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Property
            </p>
            <p className="mt-3 text-xl font-black text-slate-950">
              {property}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Inspection Date: {formatDate(inspection.inspection_date)}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Type: {inspection.inspection_type || "Inspection"}
            </p>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--fl-ground)] text-[var(--fl-text)]">
              <tr>
                <th className="px-5 py-4 text-xs font-black uppercase tracking-wide">
                  Description
                </th>
                <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-wide">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="px-5 py-5">
                  <p className="font-black text-slate-950">
                    {inspection.inspection_type || "Home Inspection"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{property}</p>
                </td>
                <td className="px-5 py-5 text-right font-black text-slate-950">
                  {money(invoiceAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-8 flex justify-end">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 p-5">
            <SummaryRow label="Invoice Amount" value={money(invoiceAmount)} />
            <SummaryRow label="Amount Paid" value={money(amountPaid)} />
            <SummaryRow label="Balance Due" value={money(balanceDue)} strong />
            <div className="mt-5 border-t border-slate-200 pt-5">
              <SummaryRow label="Status" value={status} strong />
              <SummaryRow
                label="Payment Method"
                value={inspection.payment_method || "N/A"}
              />
              <SummaryRow label="Paid At" value={formatDate(inspection.paid_at)} />
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-slate-100 p-5 text-sm leading-7 text-slate-700">
          <p className="font-bold text-slate-950">Thank you for your business.</p>
          <p className="mt-2">
            Please keep this invoice for your records. Reports are released according
            to {branding.name} delivery requirements, including signed
            agreement and completed payment where applicable.
          </p>
        </section>
      </div>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span
        className={
          strong
            ? "text-xl font-black text-slate-950"
            : "text-sm font-bold text-slate-950"
        }
      >
        {value}
      </span>
    </div>
  );
}
