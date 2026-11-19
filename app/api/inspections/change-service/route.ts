// Change an existing job's service (e.g. a job created as a Home Inspection
// before the "Pre Offer Verbal Walkthrough" service existed). Optionally
// re-picks the job's agreements for the new service. If the client had already
// signed, that signature is retired (kept as "superseded") and they sign the
// new agreement — a signature never carries over to a different document.
// Price is left as-is (the inspector adjusts it on the invoice if needed).

import { NextResponse } from "next/server";
import { getAdminClient, getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../../lib/apiAuth";
import { canonicalServiceKey, getAgreementTemplatesForInspection } from "../../../../lib/agreementTemplates";
import { currentTemplateIds, resetAgreementSignatures, templateSelectionChanged } from "../../../../lib/agreementResign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILT_IN = new Set(["home", "radon_only", "mold_only", "radon_mold", "home_radon", "home_mold", "home_radon_mold"]);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const inspectionId = String(body?.inspectionId || "").trim();
  const serviceMode = canonicalServiceKey(String(body?.serviceMode || ""));
  const swapAgreement = body?.swapAgreement === true;
  if (!inspectionId || !serviceMode) {
    return NextResponse.json({ error: "Pick a service." }, { status: 400 });
  }

  const admin = getAdminClient();
  const owned = await authorizeInspection(admin, user.id, inspectionId, "*");
  if (!owned) return notFound("Inspection not found.");

  const builtIn = BUILT_IN.has(serviceMode);
  const updates: Record<string, any> = {
    service_mode: serviceMode,
    // Built-in combos carry their own radon/mold flags; a custom service has none.
    radon: builtIn ? serviceMode.includes("radon") : false,
    mold: builtIn ? serviceMode.includes("mold") : false,
  };

  const { error } = await admin.from("inspections").update(updates).eq("id", inspectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let agreementSwapped = false;
  let agreementNote = "";
  let agreementTitles: string[] = [];

  let signaturesReset = false;
  if (swapAgreement) {
    {
      const templates = await getAgreementTemplatesForInspection({
        inspection: { ...(owned as any), ...updates, agreement_template_ids: null, agreement_template_id: null },
      });
      const ids = (templates || []).map((t: any) => t?.id).filter(Boolean);
      if (ids.length) {
        const { error: agreementError } = await admin
          .from("inspections")
          .update({ agreement_template_ids: ids, agreement_template_id: ids[0] })
          .eq("id", inspectionId);
        if (!agreementError) {
          agreementSwapped = true;
          agreementTitles = (templates || []).map((t: any) => String(t?.title || "")).filter(Boolean);
          if (templateSelectionChanged(currentTemplateIds(owned), ids)) {
            signaturesReset = await resetAgreementSignatures(admin, inspectionId);
            if (signaturesReset) agreementNote = "The client had signed the old agreement, so they'll need to sign the new one.";
          }
        }
      } else {
        agreementNote = "No agreement in your library matches this service yet, so the agreement was left as is.";
      }
    }
  }

  return NextResponse.json({ ok: true, serviceMode, agreementSwapped, agreementTitles, agreementNote, signaturesReset });
}
