import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { inspectionTimelineEngine } from "../../../../lib/ai";

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

    const [findingsResult, equipmentResult, viewEventsResult, memoryEventsResult] = await Promise.all([
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
        .from("inspection_view_events")
        .select("*")
        .eq("inspection_id_bigint", Number(inspectionId))
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("inspection_ai_memory_events")
        .select("*")
        .eq("inspection_id", String(inspectionId))
        .order("created_at", { ascending: true })
        .limit(250),
    ]);

    if (findingsResult.error) {
      console.error("Inspection timeline findings load error:", findingsResult.error);
    }

    if (equipmentResult.error) {
      console.error("Inspection timeline equipment load error:", equipmentResult.error);
    }

    if (viewEventsResult.error) {
      console.error("Inspection timeline view events load error:", viewEventsResult.error);
    }

    if (memoryEventsResult.error) {
      console.error("Inspection timeline AI memory load error:", memoryEventsResult.error);
    }

    const findings = findingsResult.data || [];
    const equipment = equipmentResult.data || [];
    const findingIds = findings.map((finding: any) => finding.id).filter(Boolean);

    const { data: photos, error: photosError } =
      findingIds.length > 0
        ? await supabase.from("photos").select("*").in("finding_id", findingIds)
        : { data: [], error: null };

    if (photosError) {
      console.error("Inspection timeline photos load error:", photosError);
    }

    const result = inspectionTimelineEngine.build({
      inspection,
      findings,
      equipment,
      photos: photos || [],
      viewEvents: viewEventsResult.data || [],
    });

    const aiEvents = (memoryEventsResult.error ? [] : memoryEventsResult.data || []).map(
      (event: any) => ({
        id: `ai-memory-${event.id}`,
        timestamp: event.created_at || new Date().toISOString(),
        title: event.title || event.event_type || "AI inspection event",
        description:
          event.detail ||
          `${String(event.event_type || "AI event").replace(/_/g, " ")} · ${String(
            event.status || "active",
          )}`,
        system: event.section || undefined,
        tone:
          String(event.status || "").toLowerCase() === "ignored"
            ? "info"
            : String(event.status || "").toLowerCase() === "accepted"
              ? "success"
              : String(event.event_type || "").toLowerCase().includes("safety")
                ? "critical"
                : "ai",
        source: "ai" as const,
        confidence:
          event.confidence === null || event.confidence === undefined
            ? undefined
            : Number(event.confidence),
        status: event.status || "active",
      }),
    );

    const mergedEvents = [...(result.events || []), ...aiEvents]
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime(),
      )
      .slice(0, 100);

    const confidenceHistory = aiEvents
      .filter((event: any) => Number.isFinite(Number(event.confidence)))
      .map((event: any) => ({
        id: event.id,
        timestamp: event.timestamp,
        title: event.title,
        confidence: Number(event.confidence),
        system: event.system,
      }));

    return NextResponse.json({
      success: true,
      ...result,
      events: mergedEvents,
      aiEventCount: aiEvents.length,
      confidenceHistory,
    });
  } catch (error: any) {
    console.error("INSPECTION TIMELINE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
