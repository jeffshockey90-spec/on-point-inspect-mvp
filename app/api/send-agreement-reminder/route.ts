import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function getBaseUrl(req: Request) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL;

  if (envUrl) {
    return envUrl.startsWith("http")
      ? envUrl
      : `https://${envUrl}`;
  }

  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const contactId = body.contactId ? String(body.contactId) : "";

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

    let query = supabase
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("agreement_required", true)
      .eq("agreement_signed", false);

    if (contactId) {
      query = query.eq("id", contactId);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) throw contactsError;

    const recipients = contacts || [];

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No unsigned required agreement contacts found." },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl(req);

    const propertyAddress =
      inspection.address ||
      inspection.property_address ||
      "the inspection property";

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <onboarding@resend.dev>";

    const sent: any[] = [];

    for (const contact of recipients) {
      const agreementUrl = `${baseUrl}/client-agreement/${inspectionId}?contact=${contact.id}`;
      const portalUrl = `${baseUrl}/client-portal/${inspectionId}`;

      const subject = `Reminder: Inspection Agreement for ${propertyAddress}`;

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
          <h2 style="color:#0f766e;">On Point Home Inspections</h2>

          <p>Hi ${contact.name || "there"},</p>

          <p>
            This is a reminder to review and sign your residential inspection agreement for:
          </p>

          <p><strong>${propertyAddress}</strong></p>

          <p>
            <a href="${agreementUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;padding:12px 18px;border-radius:10px;text-decoration:none;">
              Review & Sign Agreement
            </a>
          </p>

          <p>
            Client Portal:<br />
            <a href="${portalUrl}">${portalUrl}</a>
          </p>

          <p>
            Thank you,<br />
            On Point Home Inspections
          </p>
        </div>
      `;

      const text = `Hi ${contact.name || "there"},

This is a reminder to review and sign your residential inspection agreement for:

${propertyAddress}

Agreement:
${agreementUrl}

Client Portal:
${portalUrl}

Thank you,
On Point Home Inspections`;

      const result = await resend.emails.send({
        from: fromEmail,
        to: contact.email,
        subject,
        html,
        text,
      });

      sent.push({
        email: contact.email,
        contact_id: contact.id,
        result,
      });

      await supabase.from("client_portal_events").insert({
        inspection_id: inspectionId,
        event_type: "agreement_reminder_sent",
        event_note: `Agreement reminder sent to ${contact.email}`,
      });
    }

    return NextResponse.json({
      ok: true,
      sent,
    });
  } catch (error: any) {
    console.error("Send agreement reminder error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to send agreement reminder.",
      },
      { status: 500 }
    );
  }
}
