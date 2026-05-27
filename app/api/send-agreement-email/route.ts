import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const { data: contacts } = await supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("portal_access", true);

    const contactEmails =
      contacts?.map((c) => c.email).filter(Boolean) || [];

    const fallbackEmails = [
      inspection.client_email,
      inspection.realtor_email,
      inspection.agent_email,
    ].filter(Boolean);

    const recipients = Array.from(
      new Set([...contactEmails, ...fallbackEmails])
    );

    if (!recipients.length) {
      return NextResponse.json(
        { error: "No recipient emails found. Add a client contact with email first." },
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
      "On Point Home Inspections <onboarding@resend.dev>";

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

      console.log("Agreement email result:", result);

      sent.push({
        email,
        result,
      });
    }

    return NextResponse.json({
      success: true,
      sent,
    });
  } catch (error: any) {
    console.error("Send agreement email error:", error);

    return NextResponse.json(
      {
        error: error.message || "Failed to send agreement.",
      },
      { status: 500 }
    );
  }
}