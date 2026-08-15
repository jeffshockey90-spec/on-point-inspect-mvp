
import { formatAppValue } from "../../../../../lib/app-time";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import PrintButton from "../../../../../components/PrintButton";
import FastLinkButton from "../../../../../components/FastLinkButton";
import SignedAgreementEditor from "./SignedAgreementEditor";

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

  return formatAppValue(date, {
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
            {agreement.client_organization_name && (
              <p><strong>Business/Organization:</strong> {agreement.client_organization_name}</p>
            )}
            <p><strong>Email:</strong> {agreement.client_email || "N/A"}</p>
            <p><strong>Role:</strong> {agreement.signature_role || "client"}</p>
            {agreement.viewed_at && (
              <p><strong>First viewed:</strong> {formatSignedDate(agreement.viewed_at)}</p>
            )}
            <p><strong>Signed:</strong> {formatSignedDate(agreement.signed_at)}</p>
            {agreement.signer_ip && (
              <p><strong>Signer IP:</strong> {agreement.signer_ip}</p>
            )}
          </div>

          {(agreement.agreement_hash || agreement.esign_consent_text) && (
            <div className="mt-4 border-t border-slate-800 pt-4 print:border-black">
              <p className="text-xs font-black uppercase tracking-wide text-teal-300 print:text-black">
                Certificate of Electronic Signature
              </p>
              {agreement.esign_consent_text && (
                <p className="mt-2 text-xs leading-6 text-slate-300 print:text-black">
                  &ldquo;{agreement.esign_consent_text}&rdquo;
                </p>
              )}
              {agreement.agreement_hash && (
                <p className="mt-2 break-all font-mono text-[11px] text-slate-400 print:text-black">
                  <strong>Document SHA-256:</strong> {agreement.agreement_hash}
                </p>
              )}
              <p className="mt-2 text-[11px] leading-5 text-slate-500 print:text-black">
                Protected by the tamper-evidence hash above; any change to the agreement text
                would alter it. Executed electronically under the U.S. ESIGN Act and applicable
                state UETA.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl print:hidden">
          <h2 className="text-2xl font-extrabold">
            Client Signature
          </h2>

          <div className="mt-4 rounded-xl border border-slate-700 bg-white p-5">
            {renderSignature(signature)}
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Electronically signed by {agreement.client_name || "Client"} on{" "}
            {formatSignedDate(agreement.signed_at)}.
          </p>

          {agreement.signer_ip && (
            <p className="mt-1 text-xs text-slate-500">
              Signer IP: {agreement.signer_ip}
            </p>
          )}
        </section>

        <div className="rounded-2xl border border-teal-500 bg-[#0b1220] p-5 shadow-xl print:hidden">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
            Signed Agreement Editor
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Agreement Body
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Use the Edit Signed Agreement button below to update this saved signed agreement snapshot.
          </p>
        </div>

        <SignedAgreementEditor
          agreementId={String(agreement.id)}
          inspectionId={String(id)}
          initialBody={agreement.agreement_body || ""}
          signedAgreements={signedAgreements || []}
        />
      </div>
    </main>
  );
}
