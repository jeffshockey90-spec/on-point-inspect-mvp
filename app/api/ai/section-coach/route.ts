import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inspectionCompleteness } from "../../../../lib/ai";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function makeChecklistEvidence(rows: any[]) {
  return (rows || []).map((row) => ({
    id: `checklist-${row.id}`,
    inspection_id: row.inspection_id,
    section: row.section,
    title: row.group_title || "Checklist entry",
    observation: [row.custom_text, row.value]
      .map(cleanText)
      .filter((value) => value && value !== "__TEXT_VALUE__" && value.toLowerCase() !== "null")
      .join(" "),
    severity: "Informational",
  }));
}

function makeMemoryEvidence(rows: any[]) {
  return (rows || [])
    .filter((row) => ["completed", "accepted", "checked", "saved"].includes(cleanText(row.status).toLowerCase()))
    .map((row) => ({
      id: `memory-${row.id}`,
      inspection_id: row.inspection_id,
      section: row.section,
      title: row.title || row.event_type || "AI memory event",
      observation: row.detail || "Inspector confirmed this item during the inspection.",
      severity: "Informational",
    }));
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = cleanText(body.inspectionId || body.inspection_id);
    const section = cleanText(body.section);

    if (!inspectionId || !section) {
      return NextResponse.json(
        { error: "inspectionId and section are required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase server credentials are unavailable." },
        { status: 500 },
      );
    }

    const inspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const [inspectionResult, findingsResult, equipmentResult, limitationsResult, checklistResult, referenceResult, memoryResult] =
      await Promise.all([
        supabase.from("inspections").select("year_built, property_style, property_type").eq("id", inspectionId).maybeSingle(),
        supabase.from("findings").select("*").eq("inspection_id", inspectionId),
        supabase.from("equipment_inventory").select("*").eq("inspection_id", inspectionId),
        supabase.from("section_limitations").select("*").eq("inspection_id", inspectionId),
        supabase.from("section_checklist_selections").select("*").eq("inspection_id", inspectionId),
        supabase.from("section_reference_photos").select("*").eq("inspection_id", inspectionId),
        supabase
          .from("inspection_ai_memory_events")
          .select("*")
          .eq("inspection_id", inspectionId)
          .eq("section", section)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    const findings = findingsResult.data || [];
    const findingIds = findings.map((finding: any) => finding.id).filter(Boolean);

    const photosResult = findingIds.length
      ? await supabase.from("photos").select("*").in("finding_id", findingIds)
      : { data: [], error: null };

    const findingSectionById = new Map(
      findings.map((finding: any) => [String(finding.id), cleanText(finding.section || finding.section_name)]),
    );

    const findingPhotos = (photosResult.data || []).map((photo: any) => ({
      ...photo,
      section:
        cleanText(photo.section || photo.report_section) ||
        findingSectionById.get(String(photo.finding_id)) ||
        "",
    }));

    const referencePhotos = (referenceResult.data || []).map((photo: any) => ({
      ...photo,
      report_section: photo.section,
      title: photo.caption || "Section reference photo",
    }));

    const memoryRows = memoryResult.error ? [] : memoryResult.data || [];
    const allFindings = [
      ...findings,
      ...makeChecklistEvidence(checklistResult.data || []),
      ...makeMemoryEvidence(memoryRows),
    ];

    const review = inspectionCompleteness.analyzeSection({
      section,
      findings: allFindings,
      photos: [...findingPhotos, ...referencePhotos],
      equipment: equipmentResult.data || [],
      limitations: limitationsResult.data || [],
    });

    const yearBuilt = Number(inspectionResult.data?.year_built || 0);
    const adaptiveIssues: any[] = [];
    const normalizedSection = section.toLowerCase();

    if (yearBuilt > 0 && yearBuilt < 1970 && normalizedSection.includes("electrical")) {
      adaptiveIssues.push({
        id: `adaptive-electrical-era-${yearBuilt}`,
        title: "Older-home branch wiring reviewed",
        severity: "warning",
        section,
        category: "coach",
        reason: `This home is recorded as built in ${yearBuilt}. Older wiring methods or ungrounded receptacles may be present and should be documented when visible.`,
        recommendation: "Verify representative receptacle grounding, visible branch wiring, and panel conditions. Capture evidence or add a limitation where concealed.",
      });
    }

    if (yearBuilt > 0 && yearBuilt < 1980 && normalizedSection.includes("plumbing")) {
      adaptiveIssues.push({
        id: `adaptive-plumbing-era-${yearBuilt}`,
        title: "Older plumbing materials considered",
        severity: "info",
        section,
        category: "coach",
        reason: `The ${yearBuilt} construction era increases the likelihood of older supply or drain materials.`,
        recommendation: "Document visible supply and drain materials and note replacement or mixed-material conditions where present.",
      });
    }

    if (yearBuilt > 0 && yearBuilt < 2000 && normalizedSection.includes("garage")) {
      adaptiveIssues.push({
        id: `adaptive-garage-safety-${yearBuilt}`,
        title: "Garage opener safety evidence captured",
        severity: "warning",
        section,
        category: "coach",
        reason: "Garage-door safety sensors and reversal operation should be clearly documented when an automatic opener is present.",
        recommendation: "Capture the photo-eye sensors and document the safety-reversal test or add a limitation.",
      });
    }

    const existingIds = new Set((review.issues || []).map((issue: any) => issue.id));
    review.issues = [...(review.issues || []), ...adaptiveIssues.filter((issue) => !existingIds.has(issue.id))];
    review.canComplete = !review.issues.some((issue: any) => issue.severity === "critical" || issue.severity === "warning");
    if (adaptiveIssues.length && review.score >= 100) review.score = 95;

    return NextResponse.json({
      success: true,
      review,
      generatedAt: new Date().toISOString(),
      sourceCounts: {
        inspection: inspectionResult.data ? 1 : 0,
        findings: findings.length,
        photos: findingPhotos.length,
        referencePhotos: referencePhotos.length,
        checklistSelections: (checklistResult.data || []).length,
        equipment: (equipmentResult.data || []).length,
        limitations: (limitationsResult.data || []).length,
        memoryEvents: memoryRows.length,
      },
      warnings: [
        inspectionResult.error?.message,
        findingsResult.error?.message,
        equipmentResult.error?.message,
        limitationsResult.error?.message,
        checklistResult.error?.message,
        referenceResult.error?.message,
        photosResult.error?.message,
        memoryResult.error?.message,
      ].filter(Boolean),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Section Coach failed." },
      { status: 500 },
    );
  }
}
