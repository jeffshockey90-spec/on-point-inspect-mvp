import { NextResponse } from "next/server";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saves (or clears) a per-inspection custom agreement body. When set, the
// client-agreement page and the sign flow use this text verbatim instead of the
// live template merge. Sending an empty/null body reverts to auto-generated.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const payload = await req.json().catch(() => ({}));
  const inspectionId = String(payload.inspectionId || "").trim();
  if (!inspectionId) return notFound();

  const admin = getAdminClient();

  const inspection = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!inspection) return notFound();

  // A signed agreement is immutable — never let its text change out from under
  // a signature. Editing is only allowed before anyone has signed.
  const { data: signedAgreement } = await admin
    .from("inspection_agreements")
    .select("id")
    .eq("inspection_id", inspection.id)
    .eq("status", "signed")
    .limit(1)
    .maybeSingle();

  if (signedAgreement?.id) {
    return NextResponse.json(
      { error: "This agreement is already signed and can no longer be edited." },
      { status: 409 },
    );
  }

  const rawBody = typeof payload.body === "string" ? payload.body : "";
  const trimmed = rawBody.trim();
  const nextBody = trimmed ? rawBody : null;

  const { error } = await admin
    .from("inspections")
    .update({ custom_agreement_body: nextBody })
    .eq("id", inspection.id);

  if (error) {
    console.error("Update agreement body error:", error);
    return NextResponse.json(
      { error: error.message || "Could not save the agreement text." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, hasCustomBody: Boolean(nextBody) });
}
