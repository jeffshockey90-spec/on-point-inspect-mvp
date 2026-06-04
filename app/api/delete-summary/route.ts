import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
      return NextResponse.json(
        { error: "Missing or invalid inspection ID." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inspections")
      .update({
        executive_summary: null,
        summary_generated_at: null,
      })
      .eq("id", numericInspectionId)
      .select("id")
      .single();

    if (error) {
      console.error("Delete summary error:", error);

      return NextResponse.json(
        { error: error.message || "Failed to delete summary." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inspectionId: data?.id || numericInspectionId,
    });
  } catch (error: any) {
    console.error("Delete summary route error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to delete summary." },
      { status: 500 }
    );
  }
}
