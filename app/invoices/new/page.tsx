import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase/server";
import InvoiceBuilder from "../../../components/InvoiceBuilder";
import { normalizeCurrency } from "../../../lib/locale";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ inspection_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { inspection_id } = await searchParams;

  // The inspector's business currency (#29), for the invoice totals.
  let currency = "USD";
  try {
    const { data: cu } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .not("company_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (cu?.company_id) {
      const { data: co } = await supabase
        .from("companies")
        .select("currency")
        .eq("id", cu.company_id)
        .maybeSingle();
      currency = normalizeCurrency((co as any)?.currency);
    }
  } catch {
    currency = "USD";
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black">New Invoice</h1>
          <Link
            href="/invoices"
            className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Invoices
          </Link>
        </div>
        <InvoiceBuilder inspectionId={inspection_id || null} currency={currency} />
      </div>
    </main>
  );
}
