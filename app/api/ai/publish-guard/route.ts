import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { aiPublishGuard } from "../../../../lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId || body.inspection_id || body.id;

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 }
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
        { status: 404 }
      );
    }

    const [findingsResult, equipmentResult] = await Promise.all([
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
    ]);

    if (findingsResult.error) {
      console.error("Publish Guard findings load error:", findingsResult.error);
    }

    if (equipmentResult.error) {
      console.error("Publish Guard equipment load error:", equipmentResult.error);
    }

    const findings = findingsResult.data || [];
    const equipment = equipmentResult.data || [];
    const findingIds = findings.map((finding: any) => finding.id).filter(Boolean);

    const { data: photos, error: photosError } =
      findingIds.length > 0
        ? await supabase.from("photos").select("*").in("finding_id", findingIds)
        : { data: [], error: null };

    if (photosError) {
      console.error("Publish Guard photos load error:", photosError);
    }

    const photosByFindingId = (photos || []).reduce((acc: Record<string, any[]>, photo: any) => {
      const findingId = String(photo.finding_id || "");
      if (!findingId) return acc;
      if (!acc[findingId]) acc[findingId] = [];
      acc[findingId].push(photo);
      return acc;
    }, {});

    const normalizedFindings = findings.map((finding: any) => ({
      ...finding,
      section: finding.section || finding.section_name || "General",
      photos: photosByFindingId[String(finding.id)] || [],
    }));

    const result = aiPublishGuard.analyze({
      inspection,
      findings: normalizedFindings,
      equipment,
      photos: photos || [],
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("AI PUBLISH GUARD ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
