import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../utils/supabase/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import InvoiceBuilder from "../../../../components/InvoiceBuilder";
import { normalizeCurrency } from "../../../../lib/locale";

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

  let currency = "USD";
  try {
    if (invoice.company_id) {
      const { data: co } = await admin
        .from("companies")
        .select("currency")
        .eq("id", invoice.company_id)
        .maybeSingle();
      currency = normalizeCurrency((co as any)?.currency);
    }
  } catch {
    currency = "USD";
  }

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-10 text-[var(--fl-text)] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Edit Invoice</h1>
          <Link
            href="/invoices"
            className="rounded-xl border border-[var(--fl-line)] px-4 py-2 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
          >
            Back to Invoices
          </Link>
        </div>
        <InvoiceBuilder initialInvoice={invoice} currency={currency} />
      </div>
    </main>
  );
}
