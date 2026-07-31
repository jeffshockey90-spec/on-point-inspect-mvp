import { NextResponse } from "next/server";
import { inspectionCompleteness } from "../../../../lib/ai";
import { loadInspectionEvidence } from "../../../../lib/ai/inspectionEvidence";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const inspectionId = cleanText(body.inspectionId || body.inspection_id);
    const section = cleanText(body.section);

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const inspection = await authorizeInspection(admin, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const evidence = await loadInspectionEvidence(inspectionId);
    const result = inspectionCompleteness.analyze({
      findings: evidence.findings,
      photos: evidence.photos,
      equipment: evidence.equipment,
      limitations: evidence.limitations,
    });

    const currentSection = section
      ? result.sectionReviews.find((review) => review.section === section) || null
      : null;

    return NextResponse.json({
      success: true,
      ...result,
      currentSection,
      generatedAt: new Date().toISOString(),
      counts: {
        findings: evidence.rawFindings.length,
        photos: evidence.photos.length,
        equipment: evidence.equipment.length,
        limitations: evidence.limitations.length,
        checklistSelections: evidence.checklistSelections.length,
        referencePhotos: evidence.referencePhotos.length,
        memoryEvents: evidence.memoryEvents.length,
      },
      warnings: evidence.warnings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Inspection completeness review failed." },
      { status: 500 },
    );
  }
}
