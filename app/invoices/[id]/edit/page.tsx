import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../utils/supabase/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import InvoiceBuilder from "../../../../components/InvoiceBuilder";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const admin = getAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Authorize: the creator, or an owner of the invoice's company.
  let authorized = false;
  if (invoice) {
    if (invoice.inspector_id === user.id) {
      authorized = true;
    } else if (invoice.company_id) {
      const { data: ownerRow } = await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (ownerRow) authorized = true;
    }
  }

  if (!invoice || !authorized) notFound();

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black">Edit Invoice</h1>
          <Link
            href="/invoices"
            className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Invoices
          </Link>
        </div>
        <InvoiceBuilder initialInvoice={invoice} />
      </div>
    </main>
  );
}
