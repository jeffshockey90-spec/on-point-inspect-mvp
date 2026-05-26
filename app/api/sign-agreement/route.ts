import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import {
  buildAgreementBody,
  getAgreementTitle,
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

    const inspectionId = String(
      body.inspectionId || ""
    );

    const clientName = String(
      body.clientName || ""
    );

    const clientEmail = String(
      body.clientEmail || ""
    );

    const signature = String(
      body.signature || ""
    );

    const accepted = Boolean(
      body.accepted
    );

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    if (!accepted) {
      return NextResponse.json(
        {
          error:
            "Agreement must be accepted.",
        },
        { status: 400 }
      );
    }

    if (
      !clientName.trim() ||
      !signature.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Client name and signature are required.",
        },
        { status: 400 }
      );
    }

    const { data: inspection } =
      await supabase
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .single();

    if (!inspection) {
      return NextResponse.json(
        {
          error:
            "Inspection not found.",
        },
        { status: 404 }
      );
    }

    const state =
      normalizeAgreementState(
        inspection.state
      );

    const agreementBody =
      buildAgreementBody({
        state,
        clientName,
        propertyAddress:
          inspection.address ||
          inspection.property_address,
        fee:
          inspection.invoice_amount ||
          inspection.fee ||
          inspection.price,
        inspectorName:
          "On Point Home Inspections",
      });

    const h = await headers();

    const signerIp =
      h
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim() ||
      h.get("x-real-ip") ||
      "";

    const userAgent =
      h.get("user-agent") || "";

    const { data: agreement, error } =
      await supabase
        .from("inspection_agreements")
        .insert({
          inspection_id: inspectionId,
          inspector_id:
            inspection.inspector_id,
          state,
          agreement_version:
            getAgreementVersion(state),
          agreement_title:
            getAgreementTitle(state),
          agreement_body:
            agreementBody,
          client_name: clientName,
          client_email:
            clientEmail ||
            inspection.client_email,
          client_signature:
            signature,
          signed_at:
            new Date().toISOString(),
          signer_ip: signerIp,
          signer_user_agent:
            userAgent,
          status: "signed",
        })
        .select()
        .single();

    if (error) throw error;

    await supabase
      .from("inspections")
      .update({
        agreement_status:
          "signed",
      })
      .eq("id", inspectionId);

    await supabase
      .from("client_portal_events")
      .insert({
        inspection_id:
          inspectionId,
        event_type:
          "agreement_signed",
        event_note: `Agreement signed by ${clientName}`,
        ip_address: signerIp,
        user_agent: userAgent,
      });

    return NextResponse.json({
      ok: true,
      agreement,
    });
  } catch (error: any) {
    console.error(
      "Agreement signing error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to sign agreement.",
      },
      { status: 500 }
    );
  }
}