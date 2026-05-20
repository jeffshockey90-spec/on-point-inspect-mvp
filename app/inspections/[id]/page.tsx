import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("INSPECTIONS API ERROR:", error);

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inspections: data || [],
    });

  } catch (err: any) {
    console.error("SERVER ERROR:", err);

    return NextResponse.json(
      {
        error: err.message || "Server error",
      },
      { status: 500 }
    );
  }
}