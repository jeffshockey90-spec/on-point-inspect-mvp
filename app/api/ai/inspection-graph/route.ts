import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { buildInspectionGraph } from "../../../../lib/ai/InspectionGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id || body.id;
    if (!inspectionId) {
      return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: inspectionError?.message || "Inspection not found" }, { status: 404 });
    }

    const [findings, equipment, photos, limitations, referencePhotos, checklist, memoryEvents] = await Promise.all([
      supabase.from("findings").select("*").eq("inspection_id", inspectionId),
      supabase.from("equipment_inventory").select("*").eq("inspection_id", inspectionId),
      supabase.from("photos").select("*").eq("inspection_id", inspectionId),
      supabase.from("section_limitations").select("*").eq("inspection_id", inspectionId),
      supabase.from("section_reference_photos").select("*").eq("inspection_id", inspectionId),
      supabase.from("section_checklist_selections").select("*").eq("inspection_id", inspectionId),
      supabase.from("inspection_ai_memory_events").select("*").eq("inspection_id", String(inspectionId)).order("created_at", { ascending: false }).limit(500),
    ]);

    const graph = buildInspectionGraph({
      inspection,
      findings: findings.data || [],
      equipment: equipment.data || [],
      photos: photos.data || [],
      limitations: limitations.data || [],
      referencePhotos: referencePhotos.data || [],
      checklist: checklist.data || [],
      memoryEvents: memoryEvents.data || [],
    });

    return NextResponse.json({ success: true, graph });
  } catch (error: any) {
    console.error("INSPECTION GRAPH ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Inspection graph failed" }, { status: 500 });
  }
}
