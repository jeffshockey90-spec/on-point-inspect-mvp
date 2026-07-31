import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { houseMemory } from "../../../../lib/ai";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../../lib/apiAuth";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id || body.id;

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const authorizedInspection = await authorizeInspection(admin, user.id, inspectionId);
    if (!authorizedInspection) return notFound("Inspection not found.");

    const supabase = await createClient();

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: inspectionError?.message || "Inspection not found" },
        { status: 404 }
      );
    }

    const { data: findings, error: findingsError } = await supabase
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId);

    if (findingsError) {
      console.error("House memory findings load error:", findingsError);
    }

    const { data: equipment, error: equipmentError } = await supabase
      .from("equipment_inventory")
      .select("*")
      .eq("inspection_id", inspectionId);

    if (equipmentError) {
      console.error("House memory equipment load error:", equipmentError);
    }

    const { data: memoryEvents, error: memoryEventsError } = await supabase
      .from("inspection_ai_memory_events")
      .select("*")
      .eq("inspection_id", String(inspectionId))
      .order("created_at", { ascending: false })
      .limit(200);

    if (memoryEventsError) {
      console.error("House memory AI events load error:", memoryEventsError);
    }

    const normalizedFindings = (findings || []).map((finding: any) => ({
      ...finding,
      section: finding.section || finding.section_name || "General",
    }));

    const memory = houseMemory.buildFromInspection({
      inspection,
      findings: normalizedFindings,
      equipment: equipment || [],
      memoryEvents: memoryEvents || [],
    });

    return NextResponse.json({
      success: true,
      memory,
    });
  } catch (error: any) {
    console.error("HOUSE MEMORY ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
