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

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

// Approve offline-captured findings out of the Field Review queue.
//
// Single:   { inspectionId, findingId, section?, severity? }
//           -> optionally persists a corrected section/severity, then clears
//              needs_review for that one finding.
// Bulk:     { inspectionId, approveAll: true }
//           -> clears needs_review for every finding on the inspection that is
//              still awaiting review.
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

    // Ownership gate: the caller may only approve findings on an inspection they
    // own (company owners get their whole team via authorizeInspection).
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const approveAll = Boolean(body?.approveAll || body?.all);

    if (approveAll) {
      const { data, error } = await admin
        .from("findings")
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

    const findingId = String(body?.findingId || body?.finding_id || "").trim();
    if (!findingId) {
      return NextResponse.json(
        { error: "Missing findingId (or set approveAll)." },
        { status: 400 },
      );
    }

    // Persist any last-minute section/severity correction the inspector made in
    // the queue as part of the same approve action.
    const updatePayload: Record<string, any> = { needs_review: false };

    const section = String(body?.section || "").trim();
    if (section && VALID_SECTIONS.includes(section)) {
      updatePayload.section = section;
    }

    const severity = String(body?.severity || "").trim();
    if (severity && VALID_SEVERITIES.includes(severity)) {
      updatePayload.severity = severity;
    }

    const { data, error } = await admin
      .from("findings")
      .update(updatePayload)
      .eq("id", findingId)
      .eq("inspection_id", inspectionId)
      .select("id, section, severity, needs_review")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound("Finding not found.");

    return NextResponse.json({ ok: true, approved: 1, finding: data });
  } catch (error: any) {
    console.error("Approve finding error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to approve finding." },
      { status: 500 },
    );
  }
}
