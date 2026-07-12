import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inspectionCompleteness } from "../../../../lib/ai";

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

    const [findingsResult, equipmentResult, limitationsResult, checklistResult, referenceResult, memoryResult] =
      await Promise.all([
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

    return NextResponse.json({
      success: true,
      review,
      generatedAt: new Date().toISOString(),
      sourceCounts: {
        findings: findings.length,
        photos: findingPhotos.length,
        referencePhotos: referencePhotos.length,
        checklistSelections: (checklistResult.data || []).length,
        equipment: (equipmentResult.data || []).length,
        limitations: (limitationsResult.data || []).length,
        memoryEvents: memoryRows.length,
      },
      warnings: [
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
