import { NextResponse } from "next/server";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accumulates ACTIVE report-editing seconds (foreground heartbeat from the
// report builder) onto the inspection, so we can report "finished the report in
// X minutes." Auth-gated to the owning inspector/owner; each call is capped so a
// bad/rogue client can't inflate the number.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}) as any);
  const inspectionId = body?.inspectionId || body?.id;
  const seconds = Math.round(Number(body?.seconds));

  if (!inspectionId || !Number.isFinite(seconds) || seconds <= 0) {
    return NextResponse.json({ error: "inspectionId and positive seconds required." }, { status: 400 });
  }
  // Cap a single flush hard — the DB function also clamps, this is defense in depth.
  const capped = Math.min(seconds, 600);

  const admin = getAdminClient();
  const authorized = await authorizeInspection(admin, user.id, inspectionId);
  if (!authorized) return notFound("Inspection not found.");

  const { error } = await admin.rpc("increment_report_edit_seconds", {
    p_inspection_id: Number(inspectionId),
    p_seconds: capped,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
