import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

function getServiceType(inspection: any) {
  return String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();
}

function hasRadonService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("radon") || inspection?.radon === true;
}

function hasMoldService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("mold") || inspection?.mold === true;
}

function isStandaloneEnvironmentalService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return (
    serviceType.includes("radon_only") ||
    serviceType.includes("mold_only") ||
    serviceType.includes("radon_mold")
  );
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

async function logEmailEvent(
  supabase: any,
  {
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
  }
) {
  try {
    await supabase.from("email_logs").insert({
      inspection_id: Number(inspectionId),
      recipient,
      subject,
      status,
      resend_id: resendId || null,
      metadata,
    });
  } catch (error) {
    console.error("Email log insert failed:", error);
  }
}

async function logAuditEvent(
  supabase: any,
  {
    userId,
    action,
    resourceType,
    resourceId,
    metadata = {},
  }: {
    userId?: string | null;
    action: string;
    resourceType: string;
    resourceId: any;
    metadata?: Record<string, any>;
  }
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId || null,
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
    const { inspectionId, recipientType, recipientEmail } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (error || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const finalRecipient =
      recipientEmail ||
      (recipientType === "client"
        ? inspection.client_email
        : inspection.realtor_email || inspection.agent_email);

    if (!finalRecipient) {
      return NextResponse.json(
        { error: "No recipient email found." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const finalShareUrl = isStandaloneEnvironmentalService(inspection)
      ? `${appUrl}/environmental-share/${inspectionId}`
      : `${appUrl}/share/${inspectionId}`;

    const { data: moldTest } = await supabase
      .from("mold_tests")
      .select("lab_report_url, lab_name, result, lab_status")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    const { data: radonTest } = await supabase
      .from("radon_tests")
      .select("report_url, report_status, result, average_pci")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    const moldReportUrl =
      hasMoldService(inspection) && moldTest?.lab_report_url
        ? String(moldTest.lab_report_url)
        : "";

    const radonReportUrl =
      hasRadonService(inspection) && radonTest?.report_url
        ? String(radonTest.report_url)
        : "";

    const hasEnvironmentalLinks = Boolean(moldReportUrl || radonReportUrl);

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    const subject = isStandaloneEnvironmentalService(inspection)
      ? `Environmental Report Ready - ${property}`
      : `Inspection Report Ready - ${property}`;

    const environmentalLinksHtml = hasEnvironmentalLinks
      ? `
          <div style="margin-top:22px; padding:18px; border:1px solid #334155; border-radius:14px; background:#020617;">
            <h2 style="margin:0 0 12px 0; color:#c4b5fd; font-size:20px;">
              Official Environmental Reports
            </h2>

            <p style="color:#cbd5e1; line-height:1.6; margin:0 0 14px 0;">
              The following links open the official third-party lab or device reports.
            </p>

            ${
              moldReportUrl
                ? `
                    <p style="margin:12px 0;">
                      <a href="${escapeHtml(
                        moldReportUrl
                      )}" style="display:inline-block; background:#7c3aed; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
                        View Official Mold Report
                      </a>
                    </p>
                  `
                : ""
            }

            ${
              radonReportUrl
                ? `
                    <p style="margin:12px 0;">
                      <a href="${escapeHtml(
                        radonReportUrl
                      )}" style="display:inline-block; background:#7c3aed; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
                        View Official Radon Report
                      </a>
                    </p>
                  `
                : ""
            }
          </div>
        `
      : "";

    const html = `
      <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
        <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
          <h1 style="color:#2dd4bf; margin-top:0;">On Point Home Inspections</h1>

          <p>Hello,</p>

          <p>Your ${
            isStandaloneEnvironmentalService(inspection)
              ? "environmental report"
              : "inspection report"
          } for:</p>

          <p style="font-size:18px; font-weight:bold; color:#ffffff;">
            ${escapeHtml(property)}
          </p>

          <p>is ready to review.</p>

          <p>
            <a href="${finalShareUrl}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
              ${
                isStandaloneEnvironmentalService(inspection)
                  ? "View Environmental Report"
                  : "View Inspection Report"
              }
            </a>
          </p>

          ${environmentalLinksHtml}

          <p style="color:#cbd5e1; line-height:1.6;">
            This report is based on a visual, non-invasive inspection of readily accessible systems and components at the time of inspection.
          </p>

          <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />

          <p style="color:#94a3b8; font-size:14px;">
            On Point Home Inspections LLC<br />
            Protecting Your Investment. One Inspection at a Time.
          </p>
        </div>
      </div>
    `;

    const from =
      process.env.REPORT_EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <reports@onpointhomeinspect.com>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: finalRecipient,
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      await logEmailEvent(supabase, {
        inspectionId,
        recipient: finalRecipient,
        subject,
        status: "failed",
        metadata: {
          type: isStandaloneEnvironmentalService(inspection)
            ? "environmental_report"
            : "inspection_report",
          error:
            resendData?.message ||
            "Email failed to send. Check Resend settings.",
          resendData,
          shareUrl: finalShareUrl,
          moldReportUrl,
          radonReportUrl,
        },
      });

      return NextResponse.json(
        {
          error:
            resendData?.message ||
            "Email failed to send. Check Resend settings.",
        },
        { status: 500 }
      );
    }

    await logEmailEvent(supabase, {
      inspectionId,
      recipient: finalRecipient,
      subject,
      status: "sent",
      resendId: resendData?.id || null,
      metadata: {
        type: isStandaloneEnvironmentalService(inspection)
          ? "environmental_report"
          : "inspection_report",
        recipientType,
        shareUrl: finalShareUrl,
        moldReportUrl,
        radonReportUrl,
      },
    });

    await logAuditEvent(supabase, {
      userId: user.id,
      action: isStandaloneEnvironmentalService(inspection)
        ? "environmental_report_email_sent"
        : "report_email_sent",
      resourceType: "inspection",
      resourceId: inspectionId,
      metadata: {
        recipient: finalRecipient,
        subject,
        shareUrl: finalShareUrl,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Report email sent to ${finalRecipient}.`,
      shareUrl: finalShareUrl,
      moldReportUrl,
      radonReportUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Email failed to send." },
      { status: 500 }
    );
  }
}
