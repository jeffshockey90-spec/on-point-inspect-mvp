import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

function makeToken() {
  return crypto.randomUUID();
}

async function sendReportEmail({
  to,
  name,
  propertyAddress,
  reportLink,
}: {
  to: string;
  name?: string;
  propertyAddress?: string;
  reportLink: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in .env.local");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "On Point Home Inspections <onboarding@resend.dev>",
      to,
      subject: "Your Home Inspection Report Is Ready",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Your inspection report is ready</h2>
          <p>Hello ${name || ""},</p>
          <p>
            The home inspection report for
            <strong>${propertyAddress || "the property"}</strong>
            has been published and is ready to view.
          </p>
          <p>
            <a href="${reportLink}"
              style="display:inline-block;background:#14b8a6;color:#020617;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">
              View Report
            </a>
          </p>
          <p>
            Thank you,<br />
            On Point Home Inspections LLC
          </p>
        </div>
      `,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.message || JSON.stringify(result) || "Email failed to send"
    );
  }

  return result;
}

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspectionId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. You must be logged in." },
        { status: 401 }
      );
    }

    const shareToken = makeToken();

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .update({
        published: true,
        published_at: new Date().toISOString(),
        share_token: shareToken,
      })
      .eq("id", inspectionId)
      .select("*")
      .single();

    if (inspectionError) {
      return NextResponse.json(
        { error: inspectionError.message },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const reportLink = `${baseUrl}/reports/${inspectionId}?token=${shareToken}`;

    const sentEmails: any[] = [];

    if (inspection.client_email) {
      const clientResult = await sendReportEmail({
        to: inspection.client_email,
        name: inspection.client_name,
        propertyAddress: inspection.property_address,
        reportLink,
      });

      sentEmails.push({
        to: inspection.client_email,
        type: "client",
        result: clientResult,
      });
    }

    if (inspection.realtor_email) {
      const realtorResult = await sendReportEmail({
        to: inspection.realtor_email,
        name: inspection.realtor_name,
        propertyAddress: inspection.property_address,
        reportLink,
      });

      sentEmails.push({
        to: inspection.realtor_email,
        type: "realtor",
        result: realtorResult,
      });
    }

    if (sentEmails.length === 0) {
      return NextResponse.json(
        {
          error:
            "Report was published, but no client_email or realtor_email was found on this inspection.",
          reportLink,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Report published and emails sent.",
      reportLink,
      sentEmails,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}