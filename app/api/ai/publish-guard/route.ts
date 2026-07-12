import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { aiPublishGuard, inspectionCompleteness } from "../../../../lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id || body.id;

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: inspectionError?.message || "Inspection not found" },
        { status: 404 },
      );
    }

    const [
      findingsResult,
      equipmentResult,
      allPhotosResult,
      limitationsResult,
      referencePhotosResult,
      checklistResult,
      memoryEventsResult,
    ] = await Promise.all([
      supabase
        .from("findings")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("equipment_inventory")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("photos")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("section_limitations")
        .select("*")
        .eq("inspection_id", inspectionId),
      supabase
        .from("section_reference_photos")
        .select("*")
        .eq("inspection_id", inspectionId),
      supabase
        .from("section_checklist_selections")
        .select("*")
        .eq("inspection_id", inspectionId),
      supabase
        .from("inspection_ai_memory_events")
        .select("*")
        .eq("inspection_id", String(inspectionId))
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (findingsResult.error) {
      console.error("Publish Guard findings load error:", findingsResult.error);
    }

    if (equipmentResult.error) {
      console.error("Publish Guard equipment load error:", equipmentResult.error);
    }

    if (allPhotosResult.error) {
      console.error("Publish Guard photos load error:", allPhotosResult.error);
    }

    const findings = findingsResult.data || [];
    const equipment = equipmentResult.data || [];
    const photos = allPhotosResult.data || [];

    const photosByFindingId = photos.reduce(
      (acc: Record<string, any[]>, photo: any) => {
        const findingId = String(photo.finding_id || "");
        if (!findingId) return acc;
        if (!acc[findingId]) acc[findingId] = [];
        acc[findingId].push(photo);
        return acc;
      },
      {},
    );

    const normalizedFindings = findings.map((finding: any) => ({
      ...finding,
      section: finding.section || finding.section_name || "General",
      photos: photosByFindingId[String(finding.id)] || [],
    }));

    const checklistEvidence = (checklistResult.data || []).map((row: any) => ({
      id: `checklist-${row.id}`,
      section: row.section,
      title: row.group_title || "Checklist entry",
      observation: [row.custom_text, row.value]
        .map((value) => String(value || "").trim())
        .filter((value) => value && value !== "__TEXT_VALUE__" && value.toLowerCase() !== "null")
        .join(" "),
      severity: "Informational",
    }));

    const memoryEvidence = (memoryEventsResult.error ? [] : memoryEventsResult.data || [])
      .filter((row: any) => ["accepted", "checked", "completed", "saved"].includes(String(row.status || "").toLowerCase()))
      .map((row: any) => ({
        id: `memory-${row.id}`,
        section: row.section,
        title: row.title || row.event_type || "Inspector confirmation",
        observation: row.detail || "Inspector confirmed this item during the inspection.",
        severity: "Informational",
      }));

    const referencePhotos = (referencePhotosResult.data || []).map((photo: any) => ({
      ...photo,
      report_section: photo.section,
      title: photo.caption || "Section reference photo",
    }));

    const result = aiPublishGuard.analyze({
      inspection,
      findings: normalizedFindings,
      equipment,
      photos,
    });

    const completeness = inspectionCompleteness.analyze({
      findings: [...normalizedFindings, ...checklistEvidence, ...memoryEvidence],
      equipment,
      photos: [...photos, ...referencePhotos],
      limitations: limitationsResult.data || [],
    });

    const completenessIssues = completeness.issues.map((item) => ({
      id: `completeness-${item.id}`,
      title: item.title,
      severity: item.severity,
      section: item.section,
      reason: item.reason,
      recommendation: item.recommendation,
      blocking: item.severity === "critical",
    }));

    const mergedIssues = [...result.issues, ...completenessIssues].filter(
      (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index,
    );
    const criticalIssues = mergedIssues.filter((item) => item.severity === "critical");
    const warnings = mergedIssues.filter((item) => item.severity === "warning");
    const blocked = result.blocked || criticalIssues.some((item) => item.blocking);
    const score = Math.max(0, Math.min(result.score, completeness.score));
    const readyToPublish = !blocked && score >= 80 && warnings.length === 0;

    return NextResponse.json({
      success: true,
      ...result,
      score,
      blocked,
      readyToPublish,
      recommendation: blocked
        ? "Do Not Publish Yet"
        : readyToPublish
          ? "Ready"
          : "Review Recommended",
      issues: mergedIssues,
      criticalIssues,
      warnings,
      completeness,
    });
  } catch (error: any) {
    console.error("AI PUBLISH GUARD ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
