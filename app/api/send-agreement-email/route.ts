import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrCreateShareToken } from "../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";
import { getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../lib/apiAuth";

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

function escapeHtml(value: any) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

// The realtor-forward path exists specifically for when the inspector
// doesn't have the client's own email yet - the realtor forwards it, and
// the client fills in their own email when they actually sign. So unlike
// the direct-to-client send, a contact doesn't need an email on file here,
// just a stable id to anchor the per-signer link.
function isClientAgreementRecipientForRealtor(contact: any) {
  const role = String(contact?.role || "").toLowerCase().trim();

  return (
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

// Same idea as ensureClientContact, but for the realtor-forward path where
// the inspector may only have the client's name - creates the contact
// without requiring an email so a signing link can still be generated.
async function ensureClientContactWithoutEmail({
  inspection,
  inspectionId,
}: {
  inspection: any;
  inspectionId: any;
}) {
  const client = getInspectionClient(inspection);

  if (!client.name || client.name === "Client") return null;

  const { data: existing } = await supabase
    .from("inspection_contacts")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("name", client.name)
    .in("role", ["client", "co-client"])
    .maybeSingle();

  if (existing?.id) {
    const { data: updated } = await supabase
      .from("inspection_contacts")
      .update({
        agreement_required: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    return updated || existing;
  }

  const { data: inserted, error } = await supabase
    .from("inspection_contacts")
    .insert({
      inspection_id: inspectionId,
      inspector_id: inspection.inspector_id || inspection.user_id || null,
      name: client.name,
      // inspection_contacts.email is NOT NULL in the database (a migration
      // to drop that exists at supabase/fix-inspection-contacts-email-not-null.sql
      // but may not have been run yet) - fall back to "" rather than null so
      // this insert succeeds either way. Every read of this field already
      // treats falsy (including "") as "no email on file".
      email: client.email ? client.email.toLowerCase() : "",
      phone: client.phone || null,
      role: "client",
      agreement_required: true,
      portal_access: Boolean(client.email),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Auto-create name-only client contact failed:", error);
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
  html,
  metadata = {},
}: {
  inspectionId: any;
  recipient: string;
  subject: string;
  status: "sent" | "failed";
  resendId?: string | null;
  html?: string | null;
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
      html: html || null,
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

function getInspectionRealtor(inspection: any) {
  const name =
    cleanText(inspection?.realtor_name) || cleanText(inspection?.agent_name);

  const email =
    cleanText(inspection?.realtor_email) || cleanText(inspection?.agent_email);

  return { name, email };
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { inspectionId, recipientType } = await req.json();
    const sendToRealtor = String(recipientType || "client") === "realtor";

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

    const authorizedInspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!authorizedInspection) return notFound("Inspection not found.");

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

    const branding = await getCompanyBrandingById(inspection.company_id);

    if (inspection.agreement_waived === true) {
      return NextResponse.json(
        {
          error:
            "The agreement requirement is waived for this inspection. Remove the waiver first if you need to send a signing request.",
        },
        { status: 400 }
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

    let clientContacts = sendToRealtor
      ? (contacts || []).filter(isClientAgreementRecipientForRealtor)
      : (contacts || []).filter(isClientAgreementRecipient);

    // Backfill older reports that only have the primary client saved on the inspection row.
    if (clientContacts.length === 0) {
      if (sendToRealtor) {
        // Forwarding through the realtor doesn't require a client email on
        // file yet - the client supplies their own when they sign.
        const createdClientContact = await ensureClientContactWithoutEmail({
          inspection,
          inspectionId,
        });

        if (
          createdClientContact &&
          isClientAgreementRecipientForRealtor(createdClientContact)
        ) {
          clientContacts = [createdClientContact];
        }
      } else {
        const createdClientContact = await ensureClientContact({
          inspection,
          inspectionId,
        });

        if (createdClientContact && isClientAgreementRecipient(createdClientContact)) {
          clientContacts = [createdClientContact];
        }
      }
    }

    if (!clientContacts.length) {
      return NextResponse.json(
        {
          error: sendToRealtor
            ? "No client name found on this inspection to generate a signing link for."
            : "No unsigned client/co-buyer agreement recipient found. Add a client/co-buyer contact with an email and mark Agreement Required.",
        },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);
    const portalShareToken = await getOrCreateShareToken(supabase, inspection);
    const portalUrl = `${baseUrl}/client-portal/${portalShareToken}`;

    const property =
      inspection.address ||
      inspection.property_address ||
      "Inspection Property";

    const fromEmail = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <agreements@onpointhomeinspect.com>"
    );

    // Explicit, opt-in path: an inspector chooses this because the realtor
    // asked to receive and forward the agreement themselves - never sent
    // automatically alongside the normal client send.
    if (sendToRealtor) {
      const realtor = getInspectionRealtor(inspection);

      if (!realtor.email) {
        return NextResponse.json(
          {
            error:
              "No realtor email found on this inspection. Add a realtor email first.",
          },
          { status: 400 }
        );
      }

      const links = clientContacts.map((contact: any) => {
        const rawUrl = `${baseUrl}/client-agreement/${portalShareToken}?contact=${contact.id}`;
        const url = `${baseUrl}/api/email-click?inspection_id=${encodeURIComponent(
          String(inspection.id)
        )}&recipient_type=client&recipient_email=${encodeURIComponent(
          String(contact.email || "")
        )}&target=${encodeURIComponent(rawUrl)}`;
        return { name: contact.name || "Client", url };
      });

      const subject = `Inspection Agreement To Forward - ${property}`;
      const email = realtor.email;

      const realtorHtml = `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a;">
              <h2 style="color:#0f766e;">${escapeHtml(branding.name)}</h2>

              <p>Hi ${escapeHtml(realtor.name || "there")},</p>

              <p>Please forward the link below to the client so they can review and sign their inspection agreement for <strong>${escapeHtml(property)}</strong>.</p>

              ${links
                .map(
                  (link: any) => `
                <p>
                  <strong>${escapeHtml(link.name)}</strong><br />
                  <a href="${link.url}" style="display:inline-block;margin-top:6px;background:#14b8a6;color:#020617;font-weight:bold;padding:14px 22px;border-radius:10px;text-decoration:none;">
                    Review & Sign Agreement
                  </a>
                </p>
              `
                )
                .join("")}

              <p style="margin-top:30px;font-size:12px;color:#64748b;">
                ${escapeHtml(branding.name)}
              </p>
            </div>
          `;

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: email,
          subject,
          html: realtorHtml,
          text: `Hi ${realtor.name || "there"},

Please forward the link below to the client so they can review and sign their inspection agreement for ${property}.

${links.map((link: any) => `${link.name}: ${link.url}`).join("\n")}

${branding.name}`,
        });

        if (result.error) {
          await logEmailEvent({
            inspectionId,
            recipient: email,
            subject,
            status: "failed",
            metadata: {
              type: "agreement_realtor_email",
              links,
              recipientRule: "realtor_forward",
              error: result.error.message || "Failed to send agreement to realtor.",
            },
          });

          return NextResponse.json(
            { error: result.error.message || "Failed to send agreement to realtor." },
            { status: 500 }
          );
        }

        await logEmailEvent({
          inspectionId,
          recipient: email,
          subject,
          status: "sent",
          resendId: result?.data?.id || null,
          html: realtorHtml,
          metadata: {
            type: "agreement_realtor_email",
            links,
            recipientRule: "realtor_forward",
          },
        });

        await logAuditEvent({
          action: "agreement_email_sent_to_realtor",
          resourceType: "inspection",
          resourceId: inspectionId,
          metadata: { realtorEmail: email, links },
        });

        return NextResponse.json({
          success: true,
          message: `Agreement forwarding email sent to ${email}.`,
          sent: [{ email, links }],
          failed: [],
        });
      } catch (error: any) {
        await logEmailEvent({
          inspectionId,
          recipient: email,
          subject,
          status: "failed",
          metadata: {
            type: "agreement_realtor_email",
            links,
            recipientRule: "realtor_forward",
            error: error?.message || "Failed to send agreement to realtor.",
          },
        });

        return NextResponse.json(
          { error: error?.message || "Failed to send agreement to realtor." },
          { status: 500 }
        );
      }
    }

    const sent: any[] = [];
    const failed: any[] = [];

    for (const contact of clientContacts) {
      const email = String(contact.email || "").trim().toLowerCase();
      if (!email) continue;

      // IMPORTANT: every signer gets their own contact-specific agreement link.
      // This prevents one client from signing for every client/co-client.
      const agreementUrl = `${baseUrl}/client-agreement/${portalShareToken}?contact=${contact.id}`;
      // Wrap the link through /api/email-click so a click is recorded (email
      // link clicks were showing 0 because agreement links weren't tracked).
      const trackedAgreementUrl = `${baseUrl}/api/email-click?inspection_id=${encodeURIComponent(
        String(inspection.id)
      )}&recipient_type=${encodeURIComponent(
        contact.role || "client"
      )}&recipient_email=${encodeURIComponent(email)}&target=${encodeURIComponent(agreementUrl)}`;
      // Open-tracking pixel (best-effort — some mail clients block or proxy it).
      const emailOpenPixelUrl = `${baseUrl}/api/email-open?inspection_id=${encodeURIComponent(
        String(inspection.id)
      )}&recipient_type=${encodeURIComponent(
        contact.role || "client"
      )}&recipient_email=${encodeURIComponent(email)}`;
      const subject = `Inspection Agreement - ${property}`;

      const clientHtml = `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a;">
              <h2 style="color:#0f766e;">${escapeHtml(branding.name)}</h2>

              <p>Hi ${escapeHtml(contact.name || "there")},</p>

              <p>Please review and sign your inspection agreement before the report is delivered.</p>

              <p><strong>Property:</strong> ${escapeHtml(property)}</p>

              <p>
                <a href="${trackedAgreementUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:14px 22px;border-radius:10px;text-decoration:none;">
                  Review & Sign Agreement
                </a>
              </p>

              <p>
                Client Portal:<br />
                <a href="${portalUrl}">${portalUrl}</a>
              </p>

              <img src="${emailOpenPixelUrl}" width="1" height="1" alt="" style="display:none; opacity:0; width:1px; height:1px;" />

              <p style="margin-top:30px;font-size:12px;color:#64748b;">
                ${escapeHtml(branding.name)}
              </p>
            </div>
          `;

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: email,
          subject,
          html: clientHtml,
          text: `Hi ${contact.name || "there"},

Please review and sign your inspection agreement for ${property}.

Agreement:
${agreementUrl}

Client Portal:
${portalUrl}

${branding.name}`,
        });

        if (result.error) {
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
              error: result.error.message || "Failed to send agreement email.",
            },
          });

          failed.push({
            email,
            contact_id: contact.id,
            role: contact.role,
            error: result.error.message || "Failed to send agreement email.",
          });

          continue;
        }

        await logEmailEvent({
          inspectionId,
          recipient: email,
          subject,
          status: "sent",
          resendId: result?.data?.id || null,
          html: clientHtml,
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
