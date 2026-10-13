import Link from "next/link";
import InvoicePrintButton from "./InvoicePrintButton";

// Printable view for a STANDALONE invoice (the invoices table — e.g. add-on
// service invoices), as opposed to the inspection-level invoice. Shows the
// invoice's own line items + totals + paid status. Reads as a receipt once paid.
function money(value: any) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(value: any) {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

export default function StandaloneInvoicePrint({
  invoice,
  branding,
}: {
  invoice: any;
  branding: { name: string; tagline?: string; logoUrl?: string | null; website?: string | null; email?: string | null };
}) {
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const total = Number(invoice.total) || 0;
  const amountPaid = Number(invoice.amount_paid) || 0;
  const balanceDue =
    invoice.balance_due !== null && invoice.balance_due !== undefined
      ? Number(invoice.balance_due)
      : Math.max(0, total - amountPaid);
  const status =
    String(invoice.status || "").toLowerCase() === "paid" || balanceDue <= 0
      ? "Paid"
      : amountPaid > 0
        ? "Partial"
        : "Unpaid";
  const isPaid = status === "Paid";

  return (
    <main className="min-h-screen bg-slate-200 px-4 py-8 text-slate-950 print:bg-white print:px-0 print:py-0">
      <style>{`@media print { @page { margin: 0.5in; } body { background: white !important; } }`}</style>
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 print:hidden">
          <Link href="/invoices" className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-100">
            Back to Invoices
          </Link>
          <InvoicePrintButton />
        </div>

        <section className="flex flex-wrap items-start justify-between gap-8 border-b-4 border-teal-500 pb-8">
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-teal-500 bg-slate-50">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-black text-teal-700">
                  {branding.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-teal-700">{branding.name}</p>
              <h1 className="mt-2 text-4xl font-black text-slate-950">{isPaid ? "Receipt" : "Invoice"}</h1>
              {(branding.website || branding.email) && (
                <p className="mt-2 text-sm text-slate-600">{branding.website || branding.email}</p>
              )}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {isPaid ? "Receipt" : "Invoice"} Number
            </p>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {invoice.invoice_number || `INV-${String(invoice.id).slice(0, 8)}`}
            </p>
            <p className="mt-3 text-sm text-slate-600">Created: {fmtDate(invoice.created_at)}</p>
            {isPaid && <p className="text-sm text-slate-600">Paid: {fmtDate(invoice.paid_at)}</p>}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Bill To</p>
          <p className="mt-3 text-xl font-black text-slate-950">{invoice.client_name || "Client"}</p>
          <p className="mt-2 text-sm text-slate-700">{invoice.client_email || "No client email listed"}</p>
          {invoice.client_phone && <p className="mt-1 text-sm text-slate-700">{invoice.client_phone}</p>}
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50 text-slate-900">
              <tr>
                <th className="px-5 py-4 text-xs font-black uppercase tracking-wide">Description</th>
                <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-wide">Qty</th>
                <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-wide">Unit</th>
                <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length > 0 ? (
                lineItems.map((li: any, i: number) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="px-5 py-5 font-black text-slate-950">{li.description || "Item"}</td>
                    <td className="px-5 py-5 text-center text-slate-700">{Number(li.quantity) || 0}</td>
                    <td className="px-5 py-5 text-right text-slate-700">{money(li.unitPrice)}</td>
                    <td className="px-5 py-5 text-right font-black text-slate-950">{money(li.amount ?? (Number(li.unitPrice) || 0) * (Number(li.quantity) || 0))}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-slate-200">
                  <td className="px-5 py-5 font-black text-slate-950" colSpan={3}>Service</td>
                  <td className="px-5 py-5 text-right font-black text-slate-950">{money(total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-8 flex justify-end">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 p-5">
            <Row label="Total" value={money(total)} />
            <Row label="Amount Paid" value={money(amountPaid)} />
            <Row label="Balance Due" value={money(balanceDue)} strong />
            <div className="mt-5 border-t border-slate-200 pt-5">
              <Row label="Status" value={status} strong />
              <Row label="Paid At" value={fmtDate(invoice.paid_at)} />
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-slate-100 p-5 text-sm leading-7 text-slate-700">
          <p className="font-bold text-slate-950">Thank you for your business.</p>
          <p className="mt-2">Please keep this {isPaid ? "receipt" : "invoice"} for your records.</p>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span className={strong ? "text-xl font-black text-slate-950" : "text-sm font-bold text-slate-950"}>{value}</span>
    </div>
  );
}
