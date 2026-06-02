import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  getAgreementTemplatesForInspection,
  getAgreementTitle,
  mergeMultipleAgreementBodies,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";
import AgreementSignatureForm from "./AgreementSignatureForm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


async function recordInspectionView({
  inspectionId,
  contactId,
  viewerEmail,
}: {
  inspectionId: string | number;
  contactId?: string | null;
  viewerEmail?: string | null;
}) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: "agreement_page",
      contact_id: contactId || null,
      viewer_role: "client",
      viewer_email: viewerEmail || null,
      path: `/client-agreement/${inspectionId}`,
      metadata: {
        source: "client_agreement_page",
      },
    });
  } catch (error) {
    console.error("Agreement view tracking error:", error);
  }
}

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    contact?: string;
  }>;
};

export default async function ClientAgreementPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { contact } = await searchParams;

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
            Agreement Not Found
          </h1>

          <p className="mt-3 text-slate-300">
            This agreement link is invalid or no longer available.
          </p>
        </div>
      </main>
    );
  }

  let selectedContact: any = null;

  if (contact) {
    const { data } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("id", contact)
      .eq("inspection_id", id)
      .maybeSingle();

    selectedContact = data;
  }

  await recordInspectionView({
    inspectionId: id,
    contactId: selectedContact?.id || contact || null,
    viewerEmail: selectedContact?.email || inspection.client_email || null,
  });

  let signedAgreementQuery = supabase
    .from("inspection_agreements")
    .select("*")
    .eq("inspection_id", id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1);

  if (selectedContact?.id) {
    signedAgreementQuery = signedAgreementQuery.eq(
      "contact_id",
      selectedContact.id
    );
  }

  const { data: signedAgreement } =
    await signedAgreementQuery.maybeSingle();

  const state = normalizeAgreementState(
    inspection.agreement_state || inspection.state
  );

  const templates = await getAgreementTemplatesForInspection({
    inspection,
  });

  const agreementBody =
    signedAgreement?.agreement_body ||
    mergeMultipleAgreementBodies({
      templates,
      state,
      clientName:
        selectedContact?.name ||
        inspection.client_name,
      propertyAddress:
        inspection.address ||
        inspection.property_address,
      fee:
        inspection.invoice_amount ||
        inspection.fee ||
        inspection.price,
      inspectorName: "On Point Home Inspections",
      inspectionDate: inspection.inspection_date,
    });

  const title =
    signedAgreement?.agreement_title ||
    (templates.length > 1
      ? `${templates.length} Inspection Agreements`
      : templates[0]?.title || getAgreementTitle(state));

  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 text-4xl font-extrabold text-white">
            {title}
          </h1>

          <p className="mt-3 text-slate-300">
            Property:{" "}
            {inspection.address ||
              inspection.property_address ||
              "Inspection Property"}
          </p>

          <p className="mt-1 text-slate-400">
            Client:{" "}
            {selectedContact?.name ||
              inspection.client_name ||
              "Client"}
          </p>

          <p className="mt-1 text-slate-400">
            Agreement Selected: {state}
          </p>

          {templates.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="font-bold text-teal-300">
                Included Agreements:
              </p>

              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {templates.map((template) => (
                  <li key={template.id}>
                    {template.title} — {template.version}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/client-portal/${id}`}
              className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back to Client Portal
            </Link>

            {signedAgreement && (
              <span className="rounded-xl bg-green-500 px-4 py-2 font-bold text-slate-950">
                Signed
              </span>
            )}
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 leading-8 text-slate-950 shadow-xl">
          {agreementBody}
        </div>

        {signedAgreement ? (
          <div className="rounded-2xl border border-green-700 bg-green-950/30 p-6">
            <h2 className="text-2xl font-extrabold text-green-300">
              Agreement Signed
            </h2>

            <p className="mt-2 text-slate-300">
              Signed by {signedAgreement.client_name} on{" "}
              {new Date(
                signedAgreement.signed_at
              ).toLocaleString()}.
            </p>
          </div>
        ) : (
          <AgreementSignatureForm
            inspectionId={id}
            contactId={selectedContact?.id || ""}
            defaultClientName={
              selectedContact?.name ||
              inspection.client_name ||
              ""
            }
            defaultClientEmail={
              selectedContact?.email ||
              inspection.client_email ||
              ""
            }
          />
        )}
      </div>
    </main>
  );
}
