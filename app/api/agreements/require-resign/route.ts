// "Require new signature" (builder → Agreement → Signature Tracking): retire
// the client's existing signature so they must sign the job's CURRENT
// agreement — e.g. the agreement was changed after they signed. The old signed
// record is kept as "superseded" for the audit trail (lib/agreementResign).

import { NextResponse } from "next/server";
import { getAdminClient, getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../../lib/apiAuth";
import { resetAgreementSignatures } from "../../../../lib/agreementResign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const inspectionId = String(body?.inspectionId || "").trim();
  if (!inspectionId) return NextResponse.json({ error: "Missing inspection." }, { status: 400 });

  const admin = getAdminClient();
  const owned = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!owned) return notFound("Inspection not found.");

  const hadSignature = await resetAgreementSignatures(admin, inspectionId);
  return NextResponse.json({ ok: true, hadSignature });
}
