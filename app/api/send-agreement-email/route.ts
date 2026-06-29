import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

function isClientAgreementRecipient(contact: any) {
  const role = String(contact?.role || "").toLowerCase().trim();

  return (
    Boolean(contact?.email) &&
    Boolean(contact?.agreement_required) &&
    !Boolean(contact?.agreement_signed) &&
    (role === "client" || role === "co-client")
  );
}

function getInspectionClient(inspection: any) {
  const name =
    cleanText(inspection?.client_name) ||
    cleanText(inspection?.buyer_name) ||
    cleanText(inspection?.customer_name) ||
    "Client";

  const email =
    cleanText(inspection?.client_email) ||
    cleanText(inspection?.customer_email) ||
    cleanText(inspection?.buyer_email);

  const phone =
    cleanText(inspection?.client_phone) ||
    cleanText(inspection?.customer_phone) ||
    cleanText(inspection?.buyer_phone);

  return { name, email, phone };
}

async function ensureClientContact({
  inspection,
  inspectionId,
}: {
  inspection: any;
  inspectionId: any;
}) {
  const client = getInspectionClient(inspection);

  if (!client.email) return null;

  const { data: existing } = await supabase
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("email", client.email.toLowerCase())
    .maybeSingle();

  if (existing?.id) {
    const role = String(existing.role || "").toLowerCase();

    if (role === "client" || role === "co-client") {
      const { data: updated } = await supabase
        .from("inspection_contacts")
        .update({
          agreement_required: true,
          portal_access: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      return updated || existing;
    }

    return null;
  }

  const { data: inserted, error } = await supabase
    .from("inspection_contacts")
    .insert({
      inspection_id: inspectionId,
      inspector_id: inspection.inspector_id || inspection.user_id || null,
      name: client.name,
      email: client.email.toLowerCase(),
      phone: client.phone || null,
      role: "client",
      agreement_required: true,
      portal_access: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Auto-create client contact failed:", error);
    return null;
  }

  return inserted;
}

async function logEmailEvent({
  inspectionId,
  recipient,
  subject,
  status,
  resendId,
  metadata = {},
}: {
  inspectionId: any;
  recipient: string;
  subject: string;
  status: "sent" | "failed";
  resendId?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    const { error } = await supabase.from("email_logs").insert({
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: metadata?.type || "agreement_email",
      subject,
      message: metadata?.agreementUrl || "",
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });

    if (error) {
      console.error("EMAIL LOG INSERT ERROR:", error);
    }
  } catch (error) {
    console.error("Email log insert failed:", error);
  }
}

async function logAuditEvent({
  action,
  resourceType,
  resourceId,
  metadata = {},
}: {
  action: string;
  resourceType: string;
  resourceId: any;
  metadata?: Record<string, any>;
}) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: null,
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      metadata,
    });
  } catch (error) {
    console.error("Audit log insert failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY." },
        { status: 500 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("agreement_required", true)
      .in("role", ["client", "co-client"]);

    if (contactsError) {
      return NextResponse.json(
        { error: contactsError.message },
        { status: 500 }
      );
    }

    let clientContacts = (contacts || []).filter(isClientAgreementRecipient);

    // Backfill older reports that only have the primary client saved on the inspection row.
    if (clientContacts.length === 0) {
      const createdClientContact = await ensureClientContact({
        inspection,
        inspectionId,
      });

      if (createdClientContact && isClientAgreementRecipient(createdClientContact)) {
        clientContacts = [createdClientContact];
      }
    }

    if (!clientContacts.length) {
      return NextResponse.json(
        {
          error:
            "No unsigned client/co-client agreement recipient found. Add a client/co-client contact with an email and mark Agreement Required.",
        },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);
    const portalUrl = `${baseUrl}/client-portal/${inspectionId}`;

    const property =
      inspection.address ||
      inspection.property_address ||
      "Inspection Property";

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      process.env.REPORT_EMAIL_FROM ||
      "On Point Home Inspections <agreements@onpointhomeinspect.com>";

    const sent: any[] = [];
    const failed: any[] = [];

    for (const contact of clientContacts) {
      const email = String(contact.email || "").trim().toLowerCase();
      if (!email) continue;

      // IMPORTANT: every signer gets their own contact-specific agreement link.
      // This prevents one client from signing for every client/co-client.
      const agreementUrl = `${baseUrl}/client-agreement/${inspectionId}?contact=${contact.id}`;
      const subject = `Inspection Agreement - ${property}`;

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: email,
          subject,
          html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a;">
              <h2 style="color:#0f766e;">On Point Home Inspections</h2>

              <p>Hi ${contact.name || "there"},</p>

              <p>Please review and sign your inspection agreement before the report is delivered.</p>

              <p><strong>Property:</strong> ${property}</p>

              <p>
                <a href="${agreementUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:14px 22px;border-radius:10px;text-decoration:none;">
                  Review & Sign Agreement
                </a>
              </p>

              <p>
                Client Portal:<br />
                <a href="${portalUrl}">${portalUrl}</a>
              </p>

              <p style="margin-top:30px;font-size:12px;color:#64748b;">
                On Point Home Inspections
              </p>
            </div>
          `,
          text: `Hi ${contact.name || "there"},

Please review and sign your inspection agreement for ${property}.

Agreement:
${agreementUrl}

Client Portal:
${portalUrl}

On Point Home Inspections`,
        });

        await logEmailEvent({
          inspectionId,
          recipient: email,
          subject,
          status: "sent",
          resendId: result?.data?.id || null,
          metadata: {
            type: "agreement_email",
            agreementUrl,
            portalUrl,
            contactId: contact.id,
            contactRole: contact.role || "client",
            recipientRule: "client_or_co_client_only_contact_specific",
          },
        });

        sent.push({
          email,
          contact_id: contact.id,
          role: contact.role,
          result,
        });
      } catch (error: any) {
        await logEmailEvent({
          inspectionId,
          recipient: email,
          subject,
          status: "failed",
          metadata: {
            type: "agreement_email",
            agreementUrl,
            portalUrl,
            contactId: contact.id,
            contactRole: contact.role || "client",
            recipientRule: "client_or_co_client_only_contact_specific",
            error: error?.message || "Failed to send agreement email.",
          },
        });

        failed.push({
          email,
          contact_id: contact.id,
          role: contact.role,
          error: error?.message || "Failed to send agreement email.",
        });
      }
    }

    if (sent.length > 0) {
      await logAuditEvent({
        action: "agreement_email_sent",
        resourceType: "inspection",
        resourceId: inspectionId,
        metadata: {
          sentCount: sent.length,
          failedCount: failed.length,
          recipients: sent.map((item) => ({
            email: item.email,
            contact_id: item.contact_id,
            role: item.role,
          })),
          failed,
          portalUrl,
          recipientRule: "client_or_co_client_only_contact_specific",
        },
      });
    }

    if (!sent.length && failed.length) {
      return NextResponse.json(
        {
          error: "Failed to send agreement email.",
          failed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Agreement email sent to ${sent.length} client recipient${
        sent.length === 1 ? "" : "s"
      } with separate signing links.`,
      sent,
      failed,
    });
  } catch (error: any) {
    console.error("Send agreement email error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to send agreement.",
      },
      { status: 500 }
    );
  }
}
