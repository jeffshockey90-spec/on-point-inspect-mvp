import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { recomputeDealPrevalence } from "../../../../lib/dealInsights";
import { resolveInspectionAccessFilter } from "../../../../lib/inspectionAccess";
import { aiPublishGuard } from "../../../../lib/ai";
import { getOrCreateShareToken } from "../../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader, brandedReplyTo, type CompanyBranding } from "../../../../lib/companyBranding";
import { isSmsConfigured, sendSms } from "../../../../lib/sms";
import { smsReportReadyClient, smsReportReadyAgent } from "../../../../lib/smsTemplates";
import { listUnsubscribeHeaders } from "../../../../lib/emailUnsubscribe";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const REPORT_EMAIL_SUBJECT = "Your Home Inspection Report Is Ready";

// Record every publish email (sent or failed) in email_logs so it shows up in
// the Sent Emails list with the exact copy the recipient received, matching the
// schema used by /api/send-report-email.
async function logReportEmail(
  supabase: any,
  {
    inspectionId,
    recipient,
    recipientType,
    status,
    resendId,
    html,
    reportLink,
    error,
  }: {
    inspectionId: any;
    recipient: string;
    recipientType: "client" | "realtor";
    status: "sent" | "failed";
    resendId?: string | null;
    html?: string | null;
    reportLink?: string;
    error?: string | null;
  }
) {
  try {
    await supabase.from("email_logs").insert({
      // inspection_id is a UUID column; the numeric id goes in inspection_id_bigint.
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "inspection_report",
      subject: REPORT_EMAIL_SUBJECT,
      message:
        status === "sent"
          ? `Report email sent to ${recipient} on publish.`
          : error || "Report email failed to send on publish.",
      html: html || null,
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata: {
        type: "inspection_report",
        recipientType,
        source: "publish",
        shareUrl: reportLink || null,
        error: error || null,
      },
    });
  } catch (logError) {
    console.error("Publish email log insert failed:", logError);
  }
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
}): Promise<{ ok: boolean; resendId: string | null; html: string; error?: string }> {
  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>"
  );

  const html = `
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
    `;

  if (!process.env.RESEND_API_KEY) {
    return { ok: false, resendId: null, html, error: "Missing RESEND_API_KEY." };
  }

  const { data, error } = await resend.emails.send({
    from,
    to,
    replyTo: brandedReplyTo(branding),
    subject: REPORT_EMAIL_SUBJECT,
    html,
    headers: listUnsubscribeHeaders(Array.isArray(to) ? to[0] : to),
  });

  if (error) {
    return {
      ok: false,
      resendId: null,
      html,
      error: error.message || "Report email failed to send.",
    };
  }

  return { ok: true, resendId: data?.id || null, html };
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

    // Defense in depth on top of RLS: scope the inspection to what this user
    // may act on (own inspections, or the whole team for a company owner) so
    // publishing can't be driven against someone else's inspection even if an
    // RLS policy is ever misconfigured (audit finding H2).
    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: guardInspection, error: guardInspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
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

    // Common Ground auto-learns: the moment this inspection joins the published
    // corpus, classify its findings and recompute prevalence so the "% of homes"
    // numbers adjust with the new data — no waiting for the nightly cron. Uses a
    // service-role client (national prevalence spans all inspectors). Fully
    // best-effort: it must never delay-fail or block a publish.
    try {
      if (
        process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.NEXT_PUBLIC_SUPABASE_URL
      ) {
        const admin = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        // recomputeDealPrevalence AI-tags every still-unclassified finding on
        // the published inspections (this one included) before rolling up
        // prevalence, so no separate pre-classification pass is needed here.
        await recomputeDealPrevalence(admin);
      }
    } catch (cgErr) {
      console.error("Common Ground recompute on publish failed:", cgErr);
    }

    const branding = await getCompanyBrandingById(inspection.company_id);

    const shareToken = await getOrCreateShareToken(supabase, inspection);

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const reportLink = `${baseUrl}/share/${shareToken}`;

    const propertyAddress = inspection.property_address || inspection.address;

    const recipients: Array<{
      email: string;
      name?: string;
      type: "client" | "realtor";
    }> = [];

    if (inspection.client_email) {
      recipients.push({
        email: inspection.client_email,
        name: inspection.client_name,
        type: "client",
      });
    }

    if (inspection.realtor_email) {
      recipients.push({
        email: inspection.realtor_email,
        name: inspection.realtor_name,
        type: "realtor",
      });
    }

    const sentEmails: string[] = [];
    const failedEmails: Array<{ email: string; error?: string }> = [];

    // Send + log each recipient independently: a bad client address must not
    // stop the realtor from receiving (or being logged), and vice versa. Every
    // attempt is written to email_logs so it appears in the Sent Emails list.
    for (const recipient of recipients) {
      const result = await sendReportEmail({
        to: recipient.email,
        name: recipient.name,
        propertyAddress,
        reportLink,
        branding,
      });

      await logReportEmail(supabase, {
        inspectionId,
        recipient: recipient.email,
        recipientType: recipient.type,
        status: result.ok ? "sent" : "failed",
        resendId: result.resendId,
        html: result.html,
        reportLink,
        error: result.error,
      });

      if (result.ok) {
        sentEmails.push(recipient.email);
      } else {
        failedEmails.push({ email: recipient.email, error: result.error });
      }
    }

    // Best-effort: also text the report link to any recipient with a phone on
    // file, mirroring the emails (client wording -> client, agent wording ->
    // realtor). Never blocks or fails the publish response.
    if (isSmsConfigured()) {
      for (const recipient of recipients) {
        const phone =
          recipient.type === "client"
            ? inspection.client_phone
            : inspection.realtor_phone || inspection.agent_phone;

        if (!phone) continue;

        const link = `${reportLink}?role=${encodeURIComponent(recipient.type)}`;
        const body =
          recipient.type === "realtor"
            ? smsReportReadyAgent({ company: branding.name, address: propertyAddress, link })
            : smsReportReadyClient({ company: branding.name, address: propertyAddress, link });

        await sendSms({ to: phone, body }).catch(() => null);
      }
    }

    if (recipients.length === 0) {
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

    if (sentEmails.length === 0) {
      return NextResponse.json(
        {
          error: "Report was published, but the report emails failed to send.",
          reportLink,
          failedEmails,
          publishGuard: guardResult,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        failedEmails.length > 0
          ? `Report published. Emailed ${sentEmails.length} of ${recipients.length} recipients.`
          : "Report published and emails sent successfully.",
      reportLink,
      sentEmails,
      failedEmails,
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
