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

const VALID_SECTIONS = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

// Approve async-drafted limitations out of the Field Review queue. Mirrors
// app/api/findings/approve (limitations have no severity).
//
// Single:   { inspectionId, limitationId, section? }
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
        .from("section_limitations")
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

    const limitationId = String(body?.limitationId || body?.limitation_id || "").trim();
    if (!limitationId) {
      return NextResponse.json(
        { error: "Missing limitationId (or set approveAll)." },
        { status: 400 },
      );
    }

    const updatePayload: Record<string, any> = { needs_review: false };

    const section = String(body?.section || "").trim();
    if (section && VALID_SECTIONS.includes(section)) {
      updatePayload.section = section;
    }

    const { data, error } = await admin
      .from("section_limitations")
      .update(updatePayload)
      .eq("id", limitationId)
      .eq("inspection_id", inspectionId)
      .select("id, section, needs_review")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound("Limitation not found.");

    return NextResponse.json({ ok: true, approved: 1, limitation: data });
  } catch (error: any) {
    console.error("Approve limitation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to approve limitation." },
      { status: 500 },
    );
  }
}
