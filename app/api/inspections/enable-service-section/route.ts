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

// When an add-on service is added to an inspection, the billing + agreement
// aren't the whole picture — the service's actual DELIVERABLE has to light up
// too. For environmental add-ons that means flipping the inspection's service
// flag so the Mold / Radon report section appears in the builder AND on the
// client portal + report (both gate on serviceType.includes("mold"/"radon") ||
// inspection.mold/radon === true). This maps a service name to that flag.
//
// POST { inspectionId, service }  (service = the add-on's name)
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id;
    const service = String(body.service || body.serviceName || "").toLowerCase();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id, mold, radon");
    if (!authorized) return notFound("Inspection not found.");

    const insp: any = authorized;
    const update: Record<string, any> = {};
    const enabled: string[] = [];

    if (service.includes("mold") && insp.mold !== true) {
      update.mold = true;
      enabled.push("Mold");
    }
    if (service.includes("radon") && insp.radon !== true) {
      update.radon = true;
      enabled.push("Radon");
    }

    if (Object.keys(update).length === 0) {
      // Either not an environmental service, or already enabled — nothing to do.
      return NextResponse.json({ ok: true, enabled: [] });
    }

    const { error } = await admin.from("inspections").update(update).eq("id", inspectionId);
    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not enable the report section." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, enabled });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not enable the report section." },
      { status: 500 },
    );
  }
}
