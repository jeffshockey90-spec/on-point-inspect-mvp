import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspectionId" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("inspections")
      .update({
        report_status: "Published",
        published_at: now,
        last_saved_at: now,
      })
      .eq("id", inspectionId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      portalLink: `/client/${inspectionId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to publish report" },
      { status: 500 }
    );
  }
}