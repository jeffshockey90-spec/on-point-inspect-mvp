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
        ?.filter(
          (contact: any) =>
            contact.email &&
            (contact.agreement_required ||
              contact.portal_access ||
              ["client", "co-client"].includes(
                String(contact.role).toLowerCase()
              ))
        )
        .map((contact: any) => String(contact.email).trim().toLowerCase())
        .filter(Boolean) || [];

    const fallbackEmails = [
      inspection.client_email,
      inspection.realtor_email,
      inspection.agent_email,
    ]
      .filter(Boolean)
      .map((email: string) => String(email).trim().toLowerCase());

    const recipients = Array.from(
      new Set([...contactEmails, ...fallbackEmails])
    );

    if (!recipients.length) {
      return NextResponse.json(
        {
          error:
            "No recipient emails found. Add a client contact with an email and mark Agreement Required.",
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

    for (const email of recipients) {
      const result = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Inspection Agreement - ${property}`,
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

      sent.push({
        email,
        result,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Agreement email sent to ${sent.length} recipient${
        sent.length === 1 ? "" : "s"
      }.`,
      sent,
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
