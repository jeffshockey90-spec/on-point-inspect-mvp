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

// Saves the inspector's custom report-section order for one inspection. The
// order is an array of section names; resolveActiveSections honors it across the
// builder, share page, print/PDF, and realtor download.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const payload = await req.json().catch(() => ({}));
  const inspectionId = String(payload.inspectionId || payload.inspection_id || "").trim();
  if (!inspectionId) return notFound();

  const order = Array.isArray(payload.order)
    ? payload.order.map((name: any) => String(name || "").trim()).filter(Boolean)
    : null;

  if (!order) {
    return NextResponse.json({ error: "order must be an array." }, { status: 400 });
  }

  const admin = getAdminClient();

  const inspection = await authorizeInspection(admin, user.id, inspectionId, "id");
  if (!inspection) return notFound();

  const { error } = await admin
    .from("inspections")
    .update({ report_section_order: order })
    .eq("id", inspection.id);

  if (error) {
    console.error("Save report section order error:", error);
    return NextResponse.json(
      { error: error.message || "Could not save the section order." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
