
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PrintButton from "../../../components/PrintButton";
import {
  getAgreementTemplatesForInspection,
  getAgreementTitle,
  mergeMultipleAgreementBodies,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";
import AgreementSignatureForm from "./AgreementSignatureForm";
import { getCompanyBrandingById, getCompanyOwnerName } from "../../../lib/companyBranding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function recordInspectionView({
  inspectionId,
  contactId,
  viewerEmail,
  source,
}: {
  inspectionId: string | number;
  contactId?: string | null;
  viewerEmail?: string | null;
  source?: string | null;
}) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    const isReminder = String(source || "").toLowerCase() === "reminder";

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: isReminder ? "agreement_reminder_page" : "agreement_page",
      contact_id: contactId || null,
      viewer_role: "client",
      viewer_email: viewerEmail || null,
      path: `/client-agreement/${inspectionId}`,
      metadata: {
        source: isReminder ? "agreement_reminder_email" : "client_agreement_page",
      },
    });
  } catch (error) {
    console.error("Agreement view tracking error:", error);
  }
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

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    contact?: string;
    source?: string;
  }>;
};

export default async function ClientAgreementPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { contact, source } = await searchParams;

  // Resolve by the unguessable share token (NOT the sequential inspection id),
  // so agreement links can't be enumerated to harvest client PII / signatures.
  let { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("public_share_token", id)
    .maybeSingle();

  // Legacy raw-id fallback. Old agreement emails linked by raw id plus a
  // specific ?contact=<uuid>. Honor those ONLY when that contact id actually
  // belongs to the inspection (a hard-to-guess per-recipient secret) OR the
  // requester is a signed-in owner. A bare numeric id with neither is rejected,
  // so agreement PII / signatures can't be enumerated.
  if (!inspection && /^\d+$/.test(String(id || ""))) {
    const { data: candidate } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (candidate) {
      let allowed = false;

      if (contact) {
        const { data: contactRow } = await supabase
          .from("inspection_contacts")
          .select("id")
          .eq("id", contact)
          .eq("inspection_id", candidate.id)
          .maybeSingle();
        if (contactRow) allowed = true;
      }

      if (!allowed) {
        const {
          data: { user },
        } = await (await import("../../../utils/supabase/server"))
          .createClient()
          .then((c) => c.auth.getUser());
        if (user) {
          const { resolveInspectionAccessFilter } = await import(
            "../../../lib/inspectionAccess"
          );
          const filter = await resolveInspectionAccessFilter(supabase, user.id);
          if (
            String((candidate as any)[filter.column] || "") ===
            String(filter.value)
          ) {
            allowed = true;
          }
        }
      }

      if (allowed) inspection = candidate;
    }
  }

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
      .eq("inspection_id", inspection.id)
      .maybeSingle();

    selectedContact = data;
  }

  await recordInspectionView({
    inspectionId: inspection.id,
    contactId: selectedContact?.id || contact || null,
    viewerEmail: selectedContact?.email || inspection.client_email || null,
    source,
  });

  let signedAgreementQuery = supabase
    .from("inspection_agreements")
    .select("*")
    .eq("inspection_id", inspection.id)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1);

  if (selectedContact?.id) {
    signedAgreementQuery = signedAgreementQuery.eq(
      "contact_id",
      selectedContact.id
    );
  }

  const { data: signedAgreement } = await signedAgreementQuery.maybeSingle();

  const state = normalizeAgreementState(
    inspection.agreement_state || inspection.state
  );

  const templates = await getAgreementTemplatesForInspection({
    inspection,
  });

  const branding = await getCompanyBrandingById(inspection.company_id);
  const ownerName = await getCompanyOwnerName(inspection.company_id);

  const agreementBody =
    signedAgreement?.agreement_body ||
    mergeMultipleAgreementBodies({
      templates,
      state,
      clientName: selectedContact?.name || inspection.client_name,
      clientOrganization: inspection.client_organization_name,
      propertyAddress: inspection.address || inspection.property_address,
      fee: inspection.invoice_amount || inspection.fee || inspection.price,
      inspectorName: branding.name,
      ownerName,
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
        <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl print:border-none print:bg-white print:text-black print:shadow-none">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400 print:text-black">
            {branding.name}
          </p>

          <h1 className="mt-3 text-4xl font-extrabold text-white print:text-black">
            {title}
          </h1>

          <p className="mt-3 text-slate-300 print:text-black">
            Property: {inspection.address || inspection.property_address || "Inspection Property"}
          </p>

          <p className="mt-1 text-slate-400 print:text-black">
            Client: {selectedContact?.name || inspection.client_name || "Client"}
          </p>

          {(signedAgreement?.client_organization_name || inspection.client_organization_name) && (
            <p className="mt-1 text-slate-400 print:text-black">
              Business/Organization:{" "}
              {signedAgreement?.client_organization_name || inspection.client_organization_name}
            </p>
          )}

          <p className="mt-1 text-slate-400 print:text-black">
            Agreement Selected: {state}
          </p>

          {templates.length > 0 && !signedAgreement && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 print:bg-white print:text-black">
              <p className="font-bold text-teal-300 print:text-black">
                Included Agreements:
              </p>

              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300 print:text-black">
                {templates.map((template) => (
                  <li key={template.id}>
                    {template.title} — {template.version}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3 print:hidden">
            <Link
              href={`/client-portal/${id}`}
              className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Back to Client Portal
            </Link>

            {signedAgreement && <PrintButton label="Print / Save Signed Agreement" />}

            {signedAgreement && (
              <span className="rounded-xl bg-green-500 px-4 py-2 font-bold text-slate-950">
                Signed Copy
              </span>
            )}
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 leading-8 text-slate-950 shadow-xl print:max-h-none print:overflow-visible print:border-none print:shadow-none">
          {agreementBody}
        </div>

        {signedAgreement ? (
          <div className="rounded-2xl border border-green-700 bg-green-950/30 p-6 print:border-black print:bg-white print:text-black">
            <h2 className="text-2xl font-extrabold text-green-300 print:text-black">
              Agreement Signed
            </h2>

            <div className="mt-3 grid gap-2 text-sm text-slate-300 print:text-black md:grid-cols-2">
              <p>
                <strong>Signed by:</strong> {signedAgreement.client_name || "Client"}
              </p>
              {signedAgreement.client_organization_name && (
                <p>
                  <strong>Business/Organization:</strong> {signedAgreement.client_organization_name}
                </p>
              )}
              <p>
                <strong>Email:</strong> {signedAgreement.client_email || "N/A"}
              </p>
              <p>
                <strong>Role:</strong> {signedAgreement.signature_role || "client"}
              </p>
              <p>
                <strong>Signed at:</strong> {formatSignedDate(signedAgreement.signed_at)}
              </p>
              <p>
                <strong>IP Address:</strong> {signedAgreement.signer_ip || "N/A"}
              </p>
              <p className="break-all">
                <strong>User Agent:</strong> {signedAgreement.signer_user_agent || "N/A"}
              </p>
            </div>

            {signedAgreement.client_signature ? (
              <div className="mt-5 border-t border-green-700/40 pt-4 print:border-black">
                <p className="text-xs font-black uppercase tracking-wide text-green-300 print:text-black">
                  Signature
                </p>
                <div className="mt-2 rounded-xl bg-white p-4 print:border print:border-black">
                  {isImageSignature(signedAgreement.client_signature) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={signedAgreement.client_signature}
                      alt="Client signature"
                      className="max-h-32 max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-3xl font-semibold italic text-slate-950">
                      {signedAgreement.client_signature}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <AgreementSignatureForm
            inspectionId={String(inspection.id)}
            shareToken={String(inspection.public_share_token || "")}
            contactId={selectedContact?.id || ""}
            defaultClientName={selectedContact?.name || inspection.client_name || ""}
            defaultClientEmail={selectedContact?.email || inspection.client_email || ""}
          />
        )}
      </div>
    </main>
  );
}
