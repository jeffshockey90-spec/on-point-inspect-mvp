import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

const DEFAULT_COMPANY_ID = 1;

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);

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
    console.error(err);

    return NextResponse.json(
      {
        error: err.message,
      },
      { status: 500 }
    );
  }
}