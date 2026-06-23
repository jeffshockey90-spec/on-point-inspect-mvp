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

function isClientAgreementRecipient(contact: any) {
  const role = String(contact?.role || "").toLowerCase().trim();

  return (
    Boolean(contact?.email) &&
    Boolean(contact?.agreement_required) &&
    (role === "client" || role === "co-client")
  );
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
      .eq("inspection_id", inspectionId);

    if (contactsError) {
      return NextResponse.json(
        { error: contactsError.message },
        { status: 500 }
      );
    }

    const contactEmails =
      contacts
        ?.filter(isClientAgreementRecipient)
        .map((contact: any) => String(contact.email).trim().toLowerCase())
        .filter(Boolean) || [];

    // Strictly client-only. Realtors can have portal/report access, but they do
    // not receive pre-inspection agreement emails unless they are explicitly
    // stored as role "client" or "co-client" with agreement_required=true.
    const fallbackEmails =
      contacts && contacts.length > 0
        ? []
        : [inspection.client_email]
            .filter(Boolean)
            .map((email: string) => String(email).trim().toLowerCase());

    const recipients = Array.from(
      new Set([...contactEmails, ...fallbackEmails])
    );

    if (!recipients.length) {
      return NextResponse.json(
        {
          error:
            "No client agreement recipients found. Add a client/co-client contact with an email and mark Agreement Required.",
        },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);
    const agreementUrl = `${baseUrl}/client-agreement/${inspectionId}`;
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

    for (const email of recipients) {
      const subject = `Inspection Agreement - ${property}`;

      try {
        const result = await resend.emails.send({
          from: fromEmail,
          to: email,
          subject,
          html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a;">
              <h2 style="color:#0f766e;">On Point Home Inspections</h2>

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
          text: `Please review and sign your inspection agreement for ${property}.

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
            recipientRule: "client_or_co_client_only",
          },
        });

        sent.push({
          email,
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
            recipientRule: "client_or_co_client_only",
            error: error?.message || "Failed to send agreement email.",
          },
        });

        failed.push({
          email,
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
          recipients: sent.map((item) => item.email),
          failed,
          agreementUrl,
          portalUrl,
          recipientRule: "client_or_co_client_only",
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
      }.`,
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
