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

// Discard (permanently delete) an AI-drafted finding straight out of the Field
// Review queue — for captures the inspector decides they don't want in the
// report at all.
//
// HARD GUARD: this only ever deletes a finding that is still awaiting review
// (needs_review = true). It can never remove a finding that's already in the
// report, so a stray tap here cannot destroy approved work. Approved findings
// are deleted through the normal finding delete, not this route.
//
// Body: { inspectionId, findingId }
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    const findingId = String(body?.findingId || body?.finding_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    if (!findingId) {
      return NextResponse.json({ error: "Missing findingId." }, { status: 400 });
    }

    const admin = getAdminClient();

    // Ownership gate: the caller may only discard findings on an inspection they
    // own (company owners get their whole team via authorizeInspection).
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    // Confirm the finding exists on this inspection AND is still awaiting review
    // before deleting anything. If it's not a review-queue item, refuse.
    const { data: finding, error: findErr } = await admin
      .from("findings")
      .select("id, needs_review")
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!finding) return notFound("Finding not found.");
    if (finding.needs_review !== true) {
      return NextResponse.json(
        { error: "Only findings still awaiting review can be discarded here." },
        { status: 409 },
      );
    }

    // Remove the finding's photo rows first (photos has no cascade we rely on in
    // app code), then the finding itself. Storage objects are left in place —
    // the same as the normal finding delete — and harmless once unreferenced.
    const { error: photoErr } = await admin
      .from("photos")
      .delete()
      .eq("finding_id", findingId)
      .eq("inspection_id", inspectionId);
    if (photoErr) {
      console.warn("Discard finding: photo cleanup failed, continuing:", photoErr.message);
    }

    const { error: delErr } = await admin
      .from("findings")
      .delete()
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .eq("needs_review", true);

    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, discarded: 1, findingId });
  } catch (error: any) {
    console.error("Discard finding error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to discard finding." },
      { status: 500 },
    );
  }
}
