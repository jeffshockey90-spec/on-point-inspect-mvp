import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "../../../../utils/supabase/server";
import { aiPublishGuard } from "../../../../lib/ai";
import { getOrCreateShareToken } from "../../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader, type CompanyBranding } from "../../../../lib/companyBranding";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendReportEmail({
  to,
  name,
  propertyAddress,
  reportLink,
  branding,
}: {
  to: string;
  name?: string;
  propertyAddress?: string;
  reportLink: string;
  branding: CompanyBranding;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY.");
  }

  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>"
  );

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Your Home Inspection Report Is Ready",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #0f172a; max-width: 700px; margin: auto;">
        <div style="background:#0f172a;padding:30px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#14b8a6;margin:0;">
            ${escapeHtml(branding.name)}
          </h1>
          <p style="color:#cbd5e1;margin-top:10px;">
            ${escapeHtml(branding.tagline)}
          </p>
        </div>

        <div style="border:1px solid #cbd5e1;border-top:none;padding:35px;border-radius:0 0 12px 12px;background:white;">
          <h2 style="color:#0f766e;margin-top:0;">
            Your inspection report is ready
          </h2>

          <p>Hello ${name || ""},</p>

          <p>
            The home inspection report for:
          </p>

          <p style="font-size:18px;font-weight:bold;color:#0f172a;">
            ${propertyAddress || "Property Inspection"}
          </p>

          <p>
            Your report has been completed and is now available online.
          </p>

          <div style="margin:35px 0;text-align:center;">
            <a
              href="${reportLink}"
              style="
                display:inline-block;
                background:#14b8a6;
                color:#020617;
                padding:14px 22px;
                border-radius:10px;
                text-decoration:none;
                font-weight:bold;
                font-size:16px;
              "
            >
              View Inspection Report
            </a>
          </div>

          <p>
            If you have any questions regarding the report,
            feel free to contact us anytime.
          </p>

          <br />

          <p>
            Thank you,<br />
            <strong>${escapeHtml(branding.name)}</strong>
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message || "Report email failed to send.");
  }
}

function normalizeSection(value: any) {
  const clean = String(value || "").trim();

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean || "General";
}

export async function POST(req: Request) {
  try {
    const { inspectionId, bypassPublishGuard = false } = await req.json();

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
        {
          error: "Unauthorized. You must be logged in.",
        },
        { status: 401 }
      );
    }

    const { data: guardInspection, error: guardInspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (guardInspectionError || !guardInspection) {
      return NextResponse.json(
        { error: guardInspectionError?.message || "Inspection not found." },
        { status: 404 }
      );
    }

    const [findingsResult, equipmentResult] = await Promise.all([
      supabase
        .from("findings")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("equipment_inventory")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
    ]);

    const findings = findingsResult.data || [];
    const findingIds = findings.map((finding: any) => finding.id).filter(Boolean);

    const { data: photos } =
      findingIds.length > 0
        ? await supabase.from("photos").select("*").in("finding_id", findingIds)
        : { data: [] as any[] };

    const photosByFindingId = (photos || []).reduce(
      (acc: Record<string, any[]>, photo: any) => {
        const findingId = String(photo.finding_id || "");
        if (!findingId) return acc;
        if (!acc[findingId]) acc[findingId] = [];
        acc[findingId].push(photo);
        return acc;
      },
      {},
    );

    const normalizedFindings = findings.map((finding: any) => ({
      ...finding,
      section: normalizeSection(finding.section || finding.section_name),
      photos: photosByFindingId[String(finding.id)] || [],
    }));

    const guardResult = aiPublishGuard.analyze({
      inspection: guardInspection,
      findings: normalizedFindings,
      equipment: equipmentResult.data || [],
      photos: photos || [],
    });

    if (guardResult.blocked && !bypassPublishGuard) {
      return NextResponse.json(
        {
          error: "AI Publish Guard blocked publishing. Review the report before publishing.",
          publishGuard: guardResult,
        },
        { status: 409 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .update({
        published: true,
        published_at: new Date().toISOString(),
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

    const branding = await getCompanyBrandingById(inspection.company_id);

    const shareToken = await getOrCreateShareToken(supabase, inspection);

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const reportLink = `${baseUrl}/share/${shareToken}`;

    const sentEmails: string[] = [];

    if (inspection.client_email) {
      await sendReportEmail({
        to: inspection.client_email,
        name: inspection.client_name,
        propertyAddress: inspection.property_address || inspection.address,
        reportLink,
        branding,
      });

      sentEmails.push(inspection.client_email);
    }

    if (inspection.realtor_email) {
      await sendReportEmail({
        to: inspection.realtor_email,
        name: inspection.realtor_name,
        propertyAddress: inspection.property_address || inspection.address,
        reportLink,
        branding,
      });

      sentEmails.push(inspection.realtor_email);
    }

    if (sentEmails.length === 0) {
      return NextResponse.json(
        {
          error:
            "Report was published, but no client_email or realtor_email was found.",
          reportLink,
          publishGuard: guardResult,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Report published and emails sent successfully.",
      reportLink,
      sentEmails,
      publishGuard: guardResult,
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
