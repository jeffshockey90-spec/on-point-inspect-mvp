import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

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

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
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
    await supabase.from("email_logs").insert({
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "w9_email",
      subject,
      message: status === "sent" ? `W9 sent to ${recipient}.` : metadata?.error || "W9 send failed.",
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });
  } catch (error) {
    console.error("W9 email log insert failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { inspectionId, recipientEmail } = await req.json();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const email = cleanText(recipientEmail).toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Missing recipient email." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessFilter = await resolveInspectionAccessFilter(userClient, user.id);

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("id, address, property_address, company_id")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("w9_document_url")
      .eq("id", inspection.company_id)
      .maybeSingle();

    if (!company?.w9_document_url) {
      return NextResponse.json(
        {
          error:
            "No W9 is on file yet. Upload or fill one out in Settings → Company Profile first.",
        },
        { status: 400 }
      );
    }

    // w9_document_url actually holds a storage PATH in the private
    // company-documents bucket, not a public URL - download it with the
    // service-role client, which bypasses the bucket's RLS entirely.
    const { data: pdfFile, error: downloadError } = await supabase.storage
      .from("company-documents")
      .download(company.w9_document_url);

    if (downloadError || !pdfFile) {
      return NextResponse.json(
        { error: "Could not load the saved W9 file. Try re-uploading it in Settings." },
        { status: 500 }
      );
    }

    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());

    const branding = await getCompanyBrandingById(inspection.company_id);
    const property = inspection.address || inspection.property_address || "your inspection";

    const fromEmail = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <documents@onpointhomeinspect.com>"
    );

    const subject = `W-9 Form - ${branding.name}`;

    const html = `
      <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a;">
        <h2 style="color:#0f766e;">${escapeHtml(branding.name)}</h2>
        <p>Hi,</p>
        <p>Attached is our completed W-9 form, sent in connection with ${escapeHtml(property)}.</p>
        <p style="margin-top:30px;font-size:12px;color:#64748b;">${escapeHtml(branding.name)}</p>
      </div>
    `;

    const text = `Attached is our completed W-9 form, sent in connection with ${property}.\n\n${branding.name}`;

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        html,
        text,
        attachments: [
          {
            filename: "W9.pdf",
            content: pdfBuffer.toString("base64"),
          },
        ],
      });

      await logEmailEvent({
        inspectionId,
        recipient: email,
        subject,
        status: "sent",
        resendId: result?.data?.id || null,
      });

      return NextResponse.json({
        success: true,
        message: `W9 sent to ${email}.`,
      });
    } catch (sendError: any) {
      await logEmailEvent({
        inspectionId,
        recipient: email,
        subject,
        status: "failed",
        metadata: { error: sendError?.message || "Failed to send W9." },
      });

      return NextResponse.json(
        { error: sendError?.message || "Failed to send W9." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Send W9 error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to send W9." },
      { status: 500 }
    );
  }
}
