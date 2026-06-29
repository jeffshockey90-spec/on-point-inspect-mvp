import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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

function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
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

function isImageSignature(value: any) {
  return String(value || "").startsWith("data:image");
}

function renderSignature(signature: string) {
  if (!signature) {
    return (
      <p className="text-sm font-bold text-slate-500">
        Signature not available
      </p>
    );
  }

  if (isImageSignature(signature)) {
    return (
      <img
        src={signature}
        alt="Client signature"
        className="max-h-28 max-w-full object-contain"
      />
    );
  }

  return (
    <p className="text-3xl font-semibold italic text-slate-950">
      {signature}
    </p>
  );
}

export default async function SignedAgreementPage({ params }: PageProps) {
  const { id, agreementId } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .single();

  if (inspectionError || !inspection) {
    return (
      <main style={{ background: "#020617", color: "white", minHeight: "100vh", padding: 40 }}>
        <h1>Inspection Lookup Failed</h1>
        <pre>{JSON.stringify({ userId: user.id, inspectionId: id, inspectionError }, null, 2)}</pre>
      </main>
    );
  }

  const { data: agreement, error: agreementError } = await admin
    .from("inspection_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();

  if (agreementError || !agreement) {
    return (
      <main style={{ background: "#020617", color: "white", minHeight: "100vh", padding: 40 }}>
        <h1>Signed Agreement Not Found</h1>
        <p>This agreement could not be found.</p>
        <pre>{JSON.stringify({ inspectionId: id, agreementId, agreementError }, null, 2)}</pre>
      </main>
    );
  }

  const { data: allSignedAgreements } = await admin
    .from("inspection_agreements")
    .select("*")
    .eq("inspection_id", id)
    .eq("status", "signed")
    .order("signed_at", { ascending: true });

  const signedAgreements =
    allSignedAgreements && allSignedAgreements.length > 0
      ? allSignedAgreements
      : [agreement];

  const propertyAddress =
    inspection.address || inspection.property_address || "Inspection Property";

  const signature = String(agreement.client_signature || "").trim();

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

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl print:border-black print:bg-white print:text-black">
          <h1 className="text-4xl font-extrabold">
            Signed Inspection Agreement
          </h1>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <p><strong>Agreement:</strong> {agreement.agreement_title || "Inspection Agreement"}</p>
            <p><strong>Property:</strong> {propertyAddress}</p>
            <p><strong>Client:</strong> {agreement.client_name || "N/A"}</p>
            <p><strong>Email:</strong> {agreement.client_email || "N/A"}</p>
            <p><strong>Role:</strong> {agreement.signature_role || "client"}</p>
            <p><strong>Signed:</strong> {formatSignedDate(agreement.signed_at)}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl print:border-black print:bg-white print:text-black">
          <h2 className="text-2xl font-extrabold">
            Client Signature
          </h2>

          <div className="mt-4 rounded-xl border border-slate-700 bg-white p-5 print:border-black">
            {renderSignature(signature)}
          </div>

          <p className="mt-4 text-sm text-slate-400 print:text-black">
            Electronically signed by {agreement.client_name || "Client"} on{" "}
            {formatSignedDate(agreement.signed_at)}.
          </p>

          {agreement.signer_ip && (
            <p className="mt-1 text-xs text-slate-500 print:text-black">
              Signer IP: {agreement.signer_ip}
            </p>
          )}
        </section>

        <section className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 text-slate-950 print:border-black">
          {agreement.agreement_body || "No agreement body saved."}

          <div className="mt-10 border-t border-slate-300 pt-6">
            <p className="text-lg font-bold uppercase">
              Electronic Signature Acknowledgement
            </p>

            <p className="mt-4">
              By signing electronically, the Client confirms that they have read,
              understood, and accepted this Residential Inspection Agreement.
            </p>

            <div className="mt-6 space-y-6">
              {signedAgreements.map((signedAgreement: any) => {
                const signedSignature = String(
                  signedAgreement.client_signature || ""
                ).trim();

                return (
                  <div
                    key={signedAgreement.id}
                    className="grid gap-6 border-t border-slate-200 pt-5 md:grid-cols-2"
                  >
                    <div>
                      <p>
                        <strong>Client:</strong>{" "}
                        {signedAgreement.client_name || "N/A"}
                      </p>
                      <p>
                        <strong>Dated:</strong>{" "}
                        {formatSignedDate(signedAgreement.signed_at)}
                      </p>

                      <div className="mt-4 border-b border-slate-900 pb-2">
                        {renderSignature(signedSignature)}
                      </div>

                      <p className="mt-2 text-xs">
                        Electronically signed by{" "}
                        {signedAgreement.client_name || "Client"}
                      </p>
                    </div>

                    <div>
                      <p>
                        <strong>Email:</strong>{" "}
                        {signedAgreement.client_email || "N/A"}
                      </p>
                      <p>
                        <strong>Role:</strong>{" "}
                        {signedAgreement.signature_role || "client"}
                      </p>
                      <p>
                        <strong>Status:</strong> Signed electronically
                      </p>

                      {signedAgreement.signer_ip && (
                        <p className="text-xs">
                          <strong>Signer IP:</strong>{" "}
                          {signedAgreement.signer_ip}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}