import "server-only";

import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server credentials are unavailable.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function checklistEvidence(rows: any[]) {
  return (rows || []).map((row) => ({
    id: `checklist-${row.id}`,
    inspection_id: row.inspection_id,
    section: row.section,
    title: row.group_title || "Checklist entry",
    observation: [row.custom_text, row.value]
      .map(cleanText)
      .filter(
        (value) =>
          value && value !== "__TEXT_VALUE__" && value.toLowerCase() !== "null",
      )
      .join(" "),
    severity: "Informational",
    evidence_type: "checklist",
  }));
}

function memoryEvidence(rows: any[]) {
  return (rows || [])
    .filter((row) =>
      ["completed", "accepted", "checked", "saved", "confirmed"].includes(
        cleanText(row.status).toLowerCase(),
      ),
    )
    .map((row) => ({
      id: `memory-${row.id}`,
      inspection_id: row.inspection_id,
      section: row.section,
      title: row.title || row.event_type || "AI memory event",
      observation:
        row.detail || "Inspector confirmed this item during the inspection.",
      severity: "Informational",
      evidence_type: "memory",
    }));
}

export async function loadInspectionEvidence(inspectionId: string) {
  const supabase = createAdminClient();

  const [
    inspectionResult,
    findingsResult,
    equipmentResult,
    limitationsResult,
    checklistResult,
    referenceResult,
    memoryResult,
  ] = await Promise.all([
    supabase.from("inspections").select("*").eq("id", inspectionId).maybeSingle(),
    supabase.from("findings").select("*").eq("inspection_id", inspectionId),
    supabase.from("equipment_inventory").select("*").eq("inspection_id", inspectionId),
    supabase.from("section_limitations").select("*").eq("inspection_id", inspectionId),
    supabase
      .from("section_checklist_selections")
      .select("*")
      .eq("inspection_id", inspectionId),
    supabase
      .from("section_reference_photos")
      .select("*")
      .eq("inspection_id", inspectionId),
    supabase
      .from("inspection_ai_memory_events")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const findings = findingsResult.data || [];
  const findingIds = findings.map((finding: any) => finding.id).filter(Boolean);

  const photosResult = findingIds.length
    ? await supabase.from("photos").select("*").in("finding_id", findingIds)
    : { data: [], error: null };

  const findingSectionById = new Map(
    findings.map((finding: any) => [
      String(finding.id),
      cleanText(finding.section || finding.section_name),
    ]),
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
    evidence_type: "reference_photo",
  }));

  const memoryRows = memoryResult.error ? [] : memoryResult.data || [];

  return {
    inspection: inspectionResult.data || null,
    findings: [
      ...findings,
      ...checklistEvidence(checklistResult.data || []),
      ...memoryEvidence(memoryRows),
    ],
    rawFindings: findings,
    photos: [...findingPhotos, ...referencePhotos],
    equipment: equipmentResult.data || [],
    limitations: limitationsResult.data || [],
    checklistSelections: checklistResult.data || [],
    referencePhotos: referenceResult.data || [],
    memoryEvents: memoryRows,
    warnings: [
      inspectionResult.error?.message,
      findingsResult.error?.message,
      equipmentResult.error?.message,
      limitationsResult.error?.message,
      checklistResult.error?.message,
      referenceResult.error?.message,
      memoryResult.error?.message,
      photosResult.error?.message,
    ].filter(Boolean),
  };
}
