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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (inspectionError || !inspection) redirect("/reports");

  const { data: agreement, error: agreementError } = await supabase
    .from("inspection_agreements")
    .select("*")
    .eq("id", agreementId)
    .eq("inspection_id", id)
    .eq("status", "signed")
    .single();

  if (agreementError || !agreement) redirect(`/reports/${id}`);

  const propertyAddress =
    inspection.address || inspection.property_address || "Inspection Property";

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-5xl space-y-6 print:max-w-none print:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <FastLinkButton
            href={`/reports/${id}`}
            loadingText="Back to Report..."
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-slate-300 hover:bg-slate-800"
          >
            Back to Report
          </FastLinkButton>

          <PrintButton label="Print / Save PDF" />
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl print:border-none print:bg-white print:p-0 print:shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400 print:text-black">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 text-4xl font-extrabold text-white print:text-black">
            Signed Inspection Agreement
          </h1>

          <div className="mt-5 grid gap-3 text-sm text-slate-300 print:text-black md:grid-cols-2">
            <p>
              <strong>Agreement:</strong> {agreement.agreement_title || "Inspection Agreement"}
            </p>
            <p>
              <strong>Property:</strong> {propertyAddress}
            </p>
            <p>
              <strong>Client:</strong> {agreement.client_name || "Client"}
            </p>
            <p>
              <strong>Email:</strong> {agreement.client_email || "N/A"}
            </p>
            <p>
              <strong>Role:</strong> {agreement.signature_role || "client"}
            </p>
            <p>
              <strong>Signed:</strong> {formatSignedDate(agreement.signed_at)}
            </p>
          </div>
        </section>

        <section className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 leading-8 text-slate-950 shadow-xl print:border-none print:p-0 print:shadow-none">
          {agreement.agreement_body || "No agreement body saved."}
        </section>

        <section className="rounded-2xl border border-green-700 bg-green-950/30 p-6 print:border-black print:bg-white print:p-0 print:pt-4">
          <h2 className="text-2xl font-extrabold text-green-300 print:text-black">
            Electronic Signature Record
          </h2>

          <div className="mt-4 grid gap-3 text-sm text-slate-300 print:text-black md:grid-cols-2">
            <p>
              <strong>Signed by:</strong> {agreement.client_name || "Client"}
            </p>
            <p>
              <strong>Signature:</strong> {agreement.client_signature || "N/A"}
            </p>
            <p>
              <strong>Signed at:</strong> {formatSignedDate(agreement.signed_at)}
            </p>
            <p>
              <strong>IP Address:</strong> {agreement.signer_ip || "N/A"}
            </p>
            <p className="break-all md:col-span-2">
              <strong>User Agent:</strong> {agreement.signer_user_agent || "N/A"}
            </p>
            <p className="break-all md:col-span-2">
              <strong>Agreement ID:</strong> {agreement.id}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
