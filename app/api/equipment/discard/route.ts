import { NextResponse } from "next/server";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Discard (permanently delete) an AI-drafted equipment item straight out of the
// Field Review queue — for captures the inspector decides they don't want in the
// report at all (e.g. a duplicate of the same unit). Mirrors
// app/api/findings/discard for the equipment_inventory table.
//
// HARD GUARD: this only ever deletes equipment that is still awaiting review
// (needs_review = true). It can never remove equipment already in the report, so
// a stray tap here cannot destroy approved work.
//
// Body: { inspectionId, equipmentId }
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    const equipmentId = String(body?.equipmentId || body?.equipment_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    if (!equipmentId) {
      return NextResponse.json({ error: "Missing equipmentId." }, { status: 400 });
    }

    const admin = getAdminClient();

    // Ownership gate: the caller may only discard equipment on an inspection they
    // own (company owners get their whole team via authorizeInspection).
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Confirm the equipment exists on this inspection AND is still awaiting review
    // before deleting anything. If it's not a review-queue item, refuse.
    const { data: eq, error: findErr } = await admin
      .from("equipment_inventory")
      .select("id, needs_review")
      .eq("id", equipmentId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!eq) return notFound("Equipment not found.");
    if (eq.needs_review !== true) {
      return NextResponse.json(
        { error: "Only equipment still awaiting review can be discarded here." },
        { status: 409 },
      );
    }

    const { error: delErr } = await admin
      .from("equipment_inventory")
      .delete()
      .eq("id", equipmentId)
      .eq("inspection_id", inspectionId)
      .eq("needs_review", true);

    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, discarded: 1, equipmentId });
  } catch (error: any) {
    console.error("Discard equipment error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to discard equipment." },
      { status: 500 },
    );
  }
}
