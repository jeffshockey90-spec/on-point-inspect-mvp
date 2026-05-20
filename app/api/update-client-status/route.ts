import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { inspectionId, field, value } = await req.json();

    if (!inspectionId || !field || !value) {
      return NextResponse.json(
        { error: "Missing required data" },
        { status: 400 }
      );
    }

    const allowedFields = [
      "agreement_status",
      "payment_status",
      "review_status",
      "report_status",
    ];

    if (!allowedFields.includes(field)) {
      return NextResponse.json(
        { error: "Invalid field" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("inspections")
      .update({
        [field]: value,
      })
      .eq("id", inspectionId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}