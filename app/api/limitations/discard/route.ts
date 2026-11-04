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

// Discard (permanently delete) an AI-drafted limitation straight out of the
// Field Review queue — for captures the inspector decides they don't want in the
// report at all. Mirrors app/api/findings/discard for the section_limitations
// table, and best-effort cleans up the limitation's photo rows first.
//
// HARD GUARD: this only ever deletes a limitation that is still awaiting review
// (needs_review = true). It can never remove a limitation already in the report,
// so a stray tap here cannot destroy approved work.
//
// Body: { inspectionId, limitationId }
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    const limitationId = String(body?.limitationId || body?.limitation_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    if (!limitationId) {
      return NextResponse.json({ error: "Missing limitationId." }, { status: 400 });
    }

    const admin = getAdminClient();

    // Ownership gate: the caller may only discard limitations on an inspection
    // they own (company owners get their whole team via authorizeInspection).
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Confirm the limitation exists on this inspection AND is still awaiting
    // review before deleting anything. If it's not a review-queue item, refuse.
    const { data: lim, error: findErr } = await admin
      .from("section_limitations")
      .select("id, needs_review")
      .eq("id", limitationId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!lim) return notFound("Limitation not found.");
    if (lim.needs_review !== true) {
      return NextResponse.json(
        { error: "Only limitations still awaiting review can be discarded here." },
        { status: 409 },
      );
    }

    // Remove the limitation's photo rows first (limitation_photos is keyed by
    // limitation_id). Storage objects are left in place — the same as the normal
    // delete paths — and harmless once unreferenced.
    const { error: photoErr } = await admin
      .from("limitation_photos")
      .delete()
      .eq("limitation_id", limitationId);
    if (photoErr) {
      console.warn("Discard limitation: photo cleanup failed, continuing:", photoErr.message);
    }

    const { error: delErr } = await admin
      .from("section_limitations")
      .delete()
      .eq("id", limitationId)
      .eq("inspection_id", inspectionId)
      .eq("needs_review", true);

    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, discarded: 1, limitationId });
  } catch (error: any) {
    console.error("Discard limitation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to discard limitation." },
      { status: 500 },
    );
  }
}
