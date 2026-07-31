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

// Sets/clears the "Deliver anyway" override on an inspection. Only the company
// owner or the assigned inspector (authorizeInspection) may toggle it. When on,
// the report's server-side delivery gate releases a PUBLISHED report to the
// client even if payment/agreement aren't complete in FLOW (e.g. the agreement
// was handled in another system). Recorded with who/when for auditing.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = String(body.inspectionId || body.inspection_id || "").trim();
    const enabled = Boolean(body.enabled);

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspectionId." },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    const inspection = await authorizeInspection(admin, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const { data, error } = await admin
      .from("inspections")
      .update({
        delivery_override: enabled,
        delivery_override_by: enabled ? user.id : null,
        delivery_override_at: enabled ? new Date().toISOString() : null,
      })
      .eq("id", inspectionId)
      .select("delivery_override, delivery_override_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      delivery_override: data.delivery_override === true,
      delivery_override_at: data.delivery_override_at || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update delivery override." },
      { status: 500 }
    );
  }
}
