import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAgreementVersion,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const agreementState = normalizeAgreementState(body.agreementState);

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("inspections")
      .update({
        agreement_state: agreementState,
        agreement_version: getAgreementVersion(agreementState),
      })
      .eq("id", inspectionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      inspection: data,
      agreement_state: agreementState,
      agreement_version: getAgreementVersion(agreementState),
    });
  } catch (error: any) {
    console.error("Update agreement state error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to update agreement selection.",
      },
      { status: 500 }
    );
  }
}
