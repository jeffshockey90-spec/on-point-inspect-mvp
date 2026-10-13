import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prepare an ADD-ON service's agreement to be signed without disturbing the
// original (often already signed + delivered) job:
//   1. Append the add-on agreement template to the inspection (preserve existing).
//   2. If the report is already published/delivered, set the delivery override so
//      re-prompting the client to sign CAN'T re-lock the home report they already
//      have (isAgreementComplete would otherwise flip to false).
//   3. Re-prompt the client/co-client signers (agreement_required + NOT signed),
//      so the signing page shows them the new (combined) agreement to sign.
// After this, the caller sends the agreement via /api/send-agreement-email as
// usual — the client now qualifies as an unsigned required recipient. The prior
// signed record is preserved; the client re-affirms the combined agreement.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id;
    // templateId optional: omitted = just re-prompt the client to sign the
    // CURRENT set again (used by the add-on status panel's "Resend agreement").
    const templateId = String(body.templateId || body.template_id || "").trim();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "*");
    if (!authorized) return notFound("Inspection not found.");

    const insp: any = authorized;
    const currentIds: string[] = Array.isArray(insp.agreement_template_ids)
      ? insp.agreement_template_ids.map((v: any) => String(v))
      : [];
    const nextIds = templateId
      ? Array.from(new Set([...currentIds, templateId]))
      : currentIds;

    const published =
      insp.published === true ||
      String(insp.report_status || "").toLowerCase() === "published";

    const update: Record<string, any> = {
      agreement_template_ids: nextIds,
    };
    // Protect an already-delivered report from re-locking when we un-sign the
    // client below. Only touch the override when the report is published and it
    // isn't already set.
    if (published && insp.delivery_override !== true) {
      update.delivery_override = true;
      update.delivery_override_by = user.id;
      update.delivery_override_at = new Date().toISOString();
    }

    const { error: updErr } = await admin
      .from("inspections")
      .update(update)
      .eq("id", inspectionId);
    if (updErr) {
      return NextResponse.json(
        { error: updErr.message || "Could not attach the agreement." },
        { status: 500 },
      );
    }

    // Re-prompt client/co-client signers (with an email) to sign the new set.
    const { data: contacts } = await admin
      .from("inspection_contacts")
      .select("id, role, email")
      .eq("inspection_id", inspectionId);

    const toReset = (contacts || []).filter((c: any) => {
      const role = String(c?.role || "").toLowerCase();
      const isClient = role === "client" || role === "co-client";
      const email = String(c?.email || "").trim();
      return isClient && email.includes("@") && email.includes(".");
    });

    let reset = 0;
    for (const c of toReset) {
      // eslint-disable-next-line no-await-in-loop
      const { error } = await admin
        .from("inspection_contacts")
        // Clear signed_at too: leaving it set while agreement_signed=false makes
        // the row look half-signed. The original signing time is preserved on
        // the inspection_agreements record regardless.
        .update({ agreement_required: true, agreement_signed: false, signed_at: null })
        .eq("id", c.id);
      if (!error) reset += 1;
    }

    return NextResponse.json({
      ok: true,
      agreement_template_ids: nextIds,
      resetSigners: reset,
      overrideSet: Boolean(update.delivery_override),
      hasSigner: reset > 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not prepare the add-on agreement." },
      { status: 500 },
    );
  }
}
