import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      inspection_id,
      section,
      title,
      observation,
      implication,
      recommendation,
      image_url,
    } = body;

    const { error } = await supabase.from("findings").insert({
      inspection_id,
      section,
      title,
      observation,
      implication,
      recommendation,
      image_url,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}