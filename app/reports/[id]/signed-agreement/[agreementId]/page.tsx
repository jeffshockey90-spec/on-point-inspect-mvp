import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import PrintButton from "../../../../../components/PrintButton";
import FastLinkButton from "../../../../../components/FastLinkButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    id: string;
    agreementId: string;
  }>;
};

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

function formatSignedDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SignedAgreementPage({ params }: PageProps) {
  const { id, agreementId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .single();

  if (inspectionError || !inspection) {
    return (
      <main style={{background:"#020617",color:"white",minHeight:"100vh",padding:40}}>
        <h1>Inspection Lookup Failed</h1>
        <pre>{JSON.stringify({userId:user.id,inspectionId:id,inspectionError},null,2)}</pre>
      </main>
    );
  }

  const { data: agreement, error: agreementError } = await supabase
    .from("inspection_agreements")
    .select("*")
    .eq("id", agreementId)
    .eq("status", "signed")
    .maybeSingle();

  if (agreementError || !agreement) {
    redirect(`/reports/${id}`);
  }

  const propertyAddress = inspection.address || inspection.property_address || "Inspection Property";

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-5xl space-y-6 print:max-w-none print:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <FastLinkButton href={`/reports/${id}`} loadingText="Back to Report..." className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-slate-300 hover:bg-slate-800">
            Back to Report
          </FastLinkButton>
          <PrintButton label="Print / Save PDF" />
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <h1 className="mt-3 text-4xl font-extrabold">Signed Inspection Agreement</h1>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <p><strong>Agreement:</strong> {agreement.agreement_title || "Inspection Agreement"}</p>
            <p><strong>Property:</strong> {propertyAddress}</p>
            <p><strong>Client:</strong> {agreement.client_name}</p>
            <p><strong>Email:</strong> {agreement.client_email}</p>
            <p><strong>Role:</strong> {agreement.signature_role || "client"}</p>
            <p><strong>Signed:</strong> {formatSignedDate(agreement.signed_at)}</p>
          </div>
        </section>

        <section className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 text-slate-950">
          {agreement.agreement_body || "No agreement body saved."}
        </section>
      </div>
    </main>
  );
}
