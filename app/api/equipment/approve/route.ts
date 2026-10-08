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

// Approve async-drafted equipment out of the Field Review queue. Mirrors
// app/api/findings/approve. Equipment fields are edited in the builder's
// equipment editor, so this route only clears the review flag.
//
// Single:   { inspectionId, equipmentId }
// Bulk:     { inspectionId, approveAll: true }
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = getAdminClient();

    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const approveAll = Boolean(body?.approveAll || body?.all);

    if (approveAll) {
      const { data, error } = await admin
        .from("equipment_inventory")
        .update({ needs_review: false })
        .eq("inspection_id", inspectionId)
        .eq("needs_review", true)
        .select("id");

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        approved: Array.isArray(data) ? data.length : 0,
        approvedAll: true,
      });
    }

    const equipmentId = String(body?.equipmentId || body?.equipment_id || "").trim();
    if (!equipmentId) {
      return NextResponse.json(
        { error: "Missing equipmentId (or set approveAll)." },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("equipment_inventory")
      .update({ needs_review: false })
      .eq("id", equipmentId)
      .eq("inspection_id", inspectionId)
      .select("id, needs_review")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound("Equipment not found.");

    return NextResponse.json({ ok: true, approved: 1, equipment: data });
  } catch (error: any) {
    console.error("Approve equipment error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to approve equipment." },
      { status: 500 },
    );
  }
}
