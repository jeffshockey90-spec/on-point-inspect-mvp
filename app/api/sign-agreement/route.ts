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
import { getCompanyBrandingById, getCompanyOwnerName } from "../../../lib/companyBranding";
import { sendPushNotification } from "../../../lib/push";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

function isClientOrCoClient(contact: any) {
  const role = String(contact?.role || "").toLowerCase().trim();
  return role === "client" || role === "co-client";
}

async function updateInspectionAgreementStatus(inspectionId: string) {
  const { data: contacts } = await supabase
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("agreement_required", true)
    .in("role", ["client", "co-client"]);

  const requiredContacts = contacts || [];

  const allSigned =
    requiredContacts.length > 0 &&
    requiredContacts.every((contact) => Boolean(contact.agreement_signed));

  await supabase
    .from("inspections")
    .update({
      agreement_status: allSigned ? "signed" : "partially_signed",
    })
    .eq("id", inspectionId);
}

async function findMatchingContact({
  inspectionId,
  contactId,
  clientEmail,
  clientName,
}: {
  inspectionId: string;
  contactId: string;
  clientEmail: string;
  clientName: string;
}) {
  // IMPORTANT: if a contact-specific URL is used, only that exact contact may sign.
  // Do not fall back to another contact or one signer can accidentally sign for another.
  if (contactId) {
    const { data } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("id", contactId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    return data || null;
  }

  const cleanEmail = clientEmail.trim().toLowerCase();

  if (cleanEmail) {
    const { data } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .ilike("email", cleanEmail)
      .in("role", ["client", "co-client"])
      .maybeSingle();

    if (data) return data;
  }

  const cleanName = clientName.trim();

  if (cleanName) {
    const { data } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .ilike("name", cleanName)
      .in("role", ["client", "co-client"])
      .maybeSingle();

    if (data) return data;
  }

  const { data: firstRequiredClient } = await supabase
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("agreement_required", true)
    .eq("agreement_signed", false)
    .in("role", ["client", "co-client"])
    .limit(1)
    .maybeSingle();

  return firstRequiredClient || null;
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

    const contact = await findMatchingContact({
      inspectionId,
      contactId,
      clientEmail,
      clientName,
    });

    if (contactId && !contact) {
      return NextResponse.json(
        { error: "This agreement signing link is no longer valid." },
        { status: 404 }
      );
    }

    if (contact && !isClientOrCoClient(contact)) {
      return NextResponse.json(
        { error: "Only clients and co-clients can sign this agreement." },
        { status: 403 }
      );
    }

    if (contact && !Boolean(contact.agreement_required)) {
      return NextResponse.json(
        { error: "This contact is not required to sign this agreement." },
        { status: 400 }
      );
    }

    if (contact && Boolean(contact.agreement_signed)) {
      await updateInspectionAgreementStatus(inspectionId);

      return NextResponse.json({
        ok: true,
        alreadySigned: true,
        contactUpdated: true,
        contactId: contact.id,
      });
    }

    const state = normalizeAgreementState(
      inspection.agreement_state || inspection.state
    );

    const templates = await getAgreementTemplatesForInspection({
      inspection,
    });

    const branding = await getCompanyBrandingById(inspection.company_id);
    const ownerName = await getCompanyOwnerName(inspection.company_id);

    const agreementBody = mergeMultipleAgreementBodies({
      templates,
      state,
      clientName,
      clientOrganization: inspection.client_organization_name,
      propertyAddress: inspection.address || inspection.property_address,
      fee: inspection.invoice_amount || inspection.fee || inspection.price,
      inspectorName: branding.name,
      ownerName,
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

    const signerEmail =
      clientEmail.trim().toLowerCase() ||
      contact?.email ||
      inspection.client_email ||
      null;

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
        client_organization_name: inspection.client_organization_name || null,
        client_email: signerEmail,
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
          name: contact.name || clientName,
          email: contact.email || signerEmail,
        })
        .eq("id", contact.id)
        .eq("inspection_id", inspectionId);
    } else {
      await supabase
        .from("inspections")
        .update({
          agreement_status: "signed",
        })
        .eq("id", inspectionId);
    }

    await updateInspectionAgreementStatus(inspectionId);

    await supabase.from("client_portal_events").insert({
      inspection_id: inspectionId,
      event_type: "agreement_signed",
      event_note: `Agreement signed by ${clientName}`,
      ip_address: signerIp,
      user_agent: userAgent,
    });

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: Number(inspectionId),
      view_type: "agreement_signed",
      contact_id: contact?.id || null,
      viewer_role: contact?.role || "client",
      viewer_email: signerEmail,
      path: "/agreement",
      metadata: {
        source: "agreement_signing",
        signer_name: clientName,
        contact_id: contact?.id || null,
      },
    });

    const property = getPropertyLabel(inspection);

    if (inspection?.inspector_id) {
      await sendPushNotification({
        title: "Agreement Signed",
        body: `${clientName.trim()} signed the agreement for ${property}.`,
        url: `/reports/${inspectionId}`,
        eventType: "agreement_signed",
        target: "user",
        targetUserId: inspection.inspector_id,
      });
    }

    return NextResponse.json({
      ok: true,
      agreement,
      contactUpdated: Boolean(contact?.id),
      contactId: contact?.id || null,
    });
  } catch (error: any) {
    console.error("Agreement signing error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to sign agreement." },
      { status: 500 }
    );
  }
}
