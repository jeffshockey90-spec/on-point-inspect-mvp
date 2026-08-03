import { NextResponse } from "next/server";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../lib/apiAuth";
import {
  getAgreementTemplatesForInspection,
  mergeMultipleAgreementBodies,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";
import {
  getCompanyBrandingById,
  getCompanyOwnerName,
} from "../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the current effective agreement text for an inspection so the report
// builder's "edit full agreement" panel can preload it. A signed agreement is
// reported as locked; a saved custom body is returned as-is; otherwise the live
// template merge (with date + time) is returned.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const inspectionId = new URL(req.url).searchParams.get("inspectionId");
  if (!inspectionId) return notFound();

  const admin = getAdminClient();

  // Select * (like the rest of the app) rather than an explicit column list -
  // naming a column that doesn't exist would error the whole query and this
  // helper swallows the error to null, which looks like "not found".
  const inspection = await authorizeInspection(admin, user.id, inspectionId, "*");

  if (!inspection) return notFound();

  const { data: signedAgreement } = await admin
    .from("inspection_agreements")
    .select("id")
    .eq("inspection_id", inspection.id)
    .eq("status", "signed")
    .limit(1)
    .maybeSingle();

  const signed = Boolean(signedAgreement?.id);
  const hasCustomBody = Boolean(String(inspection.custom_agreement_body || "").trim());

  let body = "";

  if (hasCustomBody) {
    body = inspection.custom_agreement_body;
  } else {
    const state = normalizeAgreementState(
      inspection.agreement_state || inspection.state,
    );
    const templates = await getAgreementTemplatesForInspection({ inspection });
    const branding = await getCompanyBrandingById(inspection.company_id);
    const ownerName = await getCompanyOwnerName(inspection.company_id);

    body = mergeMultipleAgreementBodies({
      templates,
      state,
      clientName: inspection.client_name,
      clientOrganization: inspection.client_organization_name,
      propertyAddress: inspection.address || inspection.property_address,
      fee: inspection.invoice_amount || inspection.fee || inspection.price,
      inspectorName: branding.name,
      ownerName,
      inspectionDate: inspection.inspection_date,
      inspectionTime: inspection.inspection_time,
    });
  }

  return NextResponse.json({ body, hasCustomBody, signed });
}
