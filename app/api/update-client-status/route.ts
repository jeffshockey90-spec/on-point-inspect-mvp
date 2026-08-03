import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { field, value } = body;
    // Resolve the inspection by its unguessable share token, not a raw id, so a
    // caller can't enumerate sequential ids to flip this flag on inspections
    // they don't hold a link to. The portal sends its route param as `lookup`.
    const lookup = String(body?.lookup || body?.inspectionId || "").trim();

    if (!lookup || !field || !value) {
      return NextResponse.json(
        { error: "Missing required data" },
        { status: 400 }
      );
    }

    // This endpoint is reachable from the public, unauthenticated client
    // portal (clients have no login). Only allow the one field/value a
    // client is legitimately meant to self-report here - never
    // payment_status, agreement_status, or report_status, which must only
    // ever be set by the inspector or a verified payment webhook.
    const allowedFields = ["review_status"];
    const allowedValuesByField: Record<string, string[]> = {
      review_status: ["Submitted"],
    };

    if (!allowedFields.includes(field)) {
      return NextResponse.json(
        { error: "Invalid field" },
        { status: 400 }
      );
    }

    if (!allowedValuesByField[field].includes(value)) {
      return NextResponse.json(
        { error: "Invalid value" },
        { status: 400 }
      );
    }

    const { data: inspection } = await supabase
      .from("inspections")
      .select("id")
      .eq("public_share_token", lookup)
      .maybeSingle();

    if (!inspection?.id) {
      // Deliberate 404 (not 403) so a raw id can't be distinguished from a
      // valid-but-wrong token.
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("inspections")
      .update({
        [field]: value,
      })
      .eq("id", inspection.id);

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