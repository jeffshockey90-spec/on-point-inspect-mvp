import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import {
  getAgreementTemplatesForInspection,
  getAgreementTitle,
  getAgreementVersion,
  mergeMultipleAgreementBodies,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateInspectionAgreementStatus(inspectionId: string) {
  const { data: contacts } = await supabase
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("agreement_required", true);

  const requiredContacts = contacts || [];

  const allSigned =
    requiredContacts.length > 0 &&
    requiredContacts.every((contact) => contact.agreement_signed);

  await supabase
    .from("inspections")
    .update({
      agreement_status: allSigned ? "signed" : "partially_signed",
    })
    .eq("id", inspectionId);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const contactId = body.contactId ? String(body.contactId) : "";
    const clientName = String(body.clientName || "");
    const clientEmail = String(body.clientEmail || "");
    const signature = String(body.signature || "");
    const accepted = Boolean(body.accepted);

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    if (!accepted) {
      return NextResponse.json(
        { error: "Agreement must be accepted." },
        { status: 400 }
      );
    }

    if (!clientName.trim() || !signature.trim()) {
      return NextResponse.json(
        { error: "Client name and signature are required." },
        { status: 400 }
      );
    }

    const { data: inspection } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    let contact: any = null;

    if (contactId) {
      const { data } = await supabase
        .from("inspection_contacts")
        .select("*")
        .eq("id", contactId)
        .eq("inspection_id", inspectionId)
        .maybeSingle();

      contact = data;
    }

    const state = normalizeAgreementState(
      inspection.agreement_state || inspection.state
    );

    const templates = await getAgreementTemplatesForInspection({
      inspection,
    });

    const agreementBody = mergeMultipleAgreementBodies({
      templates,
      state,
      clientName,
      propertyAddress: inspection.address || inspection.property_address,
      fee: inspection.invoice_amount || inspection.fee || inspection.price,
      inspectorName: "On Point Home Inspections",
      inspectionDate: inspection.inspection_date,
    });

    const h = await headers();

    const signerIp =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "";

    const userAgent = h.get("user-agent") || "";

    const selectedTemplateIds = templates
      .map((template) => template.id)
      .filter(Boolean);

    const agreementTitle =
      templates.length > 1
        ? `${templates.length} Inspection Agreements`
        : templates[0]?.title || getAgreementTitle(state);

    const agreementVersion =
      templates.length > 0
        ? templates.map((template) => template.version).join(" + ")
        : getAgreementVersion(state);

    const { data: agreement, error } = await supabase
      .from("inspection_agreements")
      .insert({
        inspection_id: inspectionId,
        inspector_id: inspection.inspector_id,
        contact_id: contact?.id || null,
        agreement_template_id: selectedTemplateIds[0] || null,
        agreement_template_ids: selectedTemplateIds,
        signature_role: contact?.role || "client",
        state,
        agreement_version: agreementVersion,
        agreement_title: agreementTitle,
        agreement_body: agreementBody,
        client_name: clientName,
        client_email: clientEmail || contact?.email || inspection.client_email,
        client_signature: signature,
        signed_at: new Date().toISOString(),
        signer_ip: signerIp,
        signer_user_agent: userAgent,
        status: "signed",
      })
      .select()
      .single();

    if (error) throw error;

    if (contact?.id) {
      await supabase
        .from("inspection_contacts")
        .update({
          agreement_signed: true,
          signed_at: new Date().toISOString(),
        })
        .eq("id", contact.id);
    } else {
      await supabase
        .from("inspections")
        .update({
          agreement_status: "signed",
        })
        .eq("id", inspectionId);
    }

    if (contact?.id) {
      await updateInspectionAgreementStatus(inspectionId);
    }

    await supabase.from("client_portal_events").insert({
      inspection_id: inspectionId,
      event_type: "agreement_signed",
      event_note: `Agreement signed by ${clientName}`,
      ip_address: signerIp,
      user_agent: userAgent,
    });

    return NextResponse.json({
      ok: true,
      agreement,
    });
  } catch (error: any) {
    console.error("Agreement signing error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to sign agreement." },
      { status: 500 }
    );
  }
}
