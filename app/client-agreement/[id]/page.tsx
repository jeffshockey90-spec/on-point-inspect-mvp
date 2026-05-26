import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ClientPortalPage({ params }: PageProps) {
  const { id } = await params;

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .single();

  if (!inspection) {
    return (
      <main className="min-h-screen bg-[#020617] p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h1 className="text-3xl font-extrabold text-red-300">
            Portal Not Found
          </h1>
        </div>
      </main>
    );
  }

  const { data: signedAgreement } = await supabase
    .from("inspection_agreements")
    .select("*")
    .eq("inspection_id", id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agreementSigned = Boolean(signedAgreement);
  const paymentStatus = inspection.payment_status || "unpaid";
  const reportReady = Boolean(inspection.report_summary || inspection.published || inspection.is_published);

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 text-4xl font-extrabold">
            Client Portal
          </h1>

          <p className="mt-3 text-slate-300">
            {inspection.address || inspection.property_address || "Inspection Property"}
          </p>

          <p className="mt-1 text-slate-400">
            Client: {inspection.client_name || "Client"}
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard
            label="Agreement"
            value={agreementSigned ? "Signed" : "Pending"}
            tone={agreementSigned ? "text-green-300" : "text-yellow-300"}
          />

          <StatusCard
            label="Payment"
            value={paymentStatus}
            tone={paymentStatus === "paid" ? "text-green-300" : "text-yellow-300"}
          />

          <StatusCard
            label="Report"
            value={reportReady ? "Available / In Progress" : "Pending"}
            tone={reportReady ? "text-teal-300" : "text-slate-300"}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <PortalAction
            title="Inspection Agreement"
            description={
              agreementSigned
                ? "Your inspection agreement has been signed."
                : "Please review and sign your inspection agreement before the inspection."
            }
            href={`/client-agreement/${id}`}
            buttonText={agreementSigned ? "View Agreement" : "Review & Sign"}
            highlight={!agreementSigned}
          />

          <PortalAction
            title="Payment"
            description="Payment collection is ready for Stripe/Square connection. For now, this card tracks payment status."
            href="#"
            buttonText={paymentStatus === "paid" ? "Paid" : "Payment Coming Soon"}
            highlight={paymentStatus !== "paid"}
          />

          <PortalAction
            title="Inspection Report"
            description="View the public report/share page once it is published."
            href={`/share/${id}`}
            buttonText="View Report"
            highlight={false}
          />

          <PortalAction
            title="Repair Request"
            description="View repair request details when available."
            href={`/repair-request?inspection_id=${id}`}
            buttonText="Open Repair Request"
            highlight={false}
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <h2 className="text-2xl font-extrabold text-teal-300">
            Inspection Details
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Detail label="Date" value={inspection.inspection_date} />
            <Detail label="Fee" value={inspection.invoice_amount || inspection.fee || inspection.price} />
            <Detail label="Client Email" value={inspection.client_email} />
            <Detail label="State" value={inspection.state} />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className={`mt-2 text-2xl font-black capitalize ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function PortalAction({
  title,
  description,
  href,
  buttonText,
  highlight,
}: {
  title: string;
  description: string;
  href: string;
  buttonText: string;
  highlight: boolean;
}) {
  const content = (
    <div className={`rounded-2xl border p-6 ${
      highlight
        ? "border-teal-500 bg-teal-950/20"
        : "border-slate-800 bg-[#0b1220]"
    }`}>
      <h2 className="text-2xl font-extrabold text-white">
        {title}
      </h2>

      <p className="mt-2 min-h-[48px] text-slate-300">
        {description}
      </p>

      <div className={`mt-5 inline-block rounded-xl px-5 py-3 font-bold ${
        highlight
          ? "bg-teal-500 text-slate-950"
          : "border border-slate-600 text-slate-200"
      }`}>
        {buttonText}
      </div>
    </div>
  );

  if (href === "#") return content;

  return <Link href={href}>{content}</Link>;
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-slate-100">
        {value || "Not entered"}
      </p>
    </div>
  );
}
