import { NextResponse } from "next/server";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";
import { learningEngine } from "../../../../lib/ai/LearningEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINDING_LEARN_SELECT =
  "id, inspection_id, inspector_id, section, severity, needs_review, title, observation, implication, recommendation, ai_prediction";

function eqText(a: any, b: any) {
  return String(a || "").trim() === String(b || "").trim();
}

// Emit a learning signal for each approved draft. Findings approved AS-IS (or
// with only a section/severity correction) never otherwise feed the loop —
// EditableFinding only learns when the body wording is edited, and by the time
// a background draft is approved from the review queue its in-memory baseline
// is long gone. We read the pinned ai_prediction (stored at sync time) and
// compare. If the BODY wording was rewritten we skip, since EditableFinding
// already recorded that edit (no double-counting). Fully best-effort.
async function recordApprovalLearning(
  admin: any,
  inspectionId: string,
  rows: any[],
  fallbackInspectorId: string | null,
) {
  const events = [];
  for (const row of rows || []) {
    const pred = row?.ai_prediction;
    if (!pred || typeof pred !== "object") continue;

    const updated = {
      title: String(row.title || ""),
      section: String(row.section || ""),
      severity: String(row.severity || ""),
      observation: String(row.observation || ""),
      implication: String(row.implication || ""),
      recommendation: String(row.recommendation || ""),
    };

    const bodyKept =
      eqText(pred.title, updated.title) &&
      eqText(pred.observation, updated.observation) &&
      eqText(pred.implication, updated.implication) &&
      eqText(pred.recommendation, updated.recommendation);
    if (!bodyKept) continue;

    events.push({
      inspectionId,
      // Attribute to the inspector who OWNS the finding (so a company owner
      // clearing a teammate's queue teaches the teammate, not the owner),
      // falling back to the inspection's inspector.
      inspectorId: row.inspector_id || fallbackInspectorId || null,
      tool: "field_review_approve",
      aiPrediction: pred,
      inspectorResult: updated,
      accepted: true as const,
      notes:
        "Inspector approved an AI-drafted finding from the review queue. Body wording kept; any section/severity difference is a routing/severity preference.",
    });
  }
  if (!events.length) return;
  // One batched insert via the service-role client (bypasses the cookie
  // client's inspector_id = auth.uid() RLS so a teammate's id can be stamped),
  // instead of a per-row re-auth + insert that blocked Approve-All.
  await learningEngine.recordMany(events, { client: admin }).catch(() => null);
}

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
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id, inspector_id");
    if (!authorized) return notFound();
    const inspectionInspectorId: string | null = (authorized as any)?.inspector_id ?? null;

    const approveAll = Boolean(body?.approveAll || body?.all);

    if (approveAll) {
      const { data, error } = await admin
        .from("findings")
        .update({ needs_review: false })
        .eq("inspection_id", inspectionId)
        .eq("needs_review", true)
        .select(FINDING_LEARN_SELECT);

      if (error) throw error;

      await recordApprovalLearning(admin, inspectionId, data || [], inspectionInspectorId);

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
      .select(FINDING_LEARN_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound("Finding not found.");

    await recordApprovalLearning(admin, inspectionId, [data], inspectionInspectorId);

    return NextResponse.json({
      ok: true,
      approved: 1,
      finding: {
        id: data.id,
        section: data.section,
        severity: data.severity,
        needs_review: data.needs_review,
      },
    });
  } catch (error: any) {
    console.error("Approve finding error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to approve finding." },
      { status: 500 },
    );
  }
}
