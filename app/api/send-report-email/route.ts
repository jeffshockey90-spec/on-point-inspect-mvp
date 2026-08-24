import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { emitWebhook } from "../../../lib/webhooks";
import { getOrCreateShareToken } from "../../../lib/shareToken";
import { getCompanyBrandingById, buildBrandedFromHeader, type CompanyBranding } from "../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";
import { isSmsConfigured, sendSms } from "../../../lib/sms";
import { smsReportReadyClient, smsReportReadyAgent } from "../../../lib/smsTemplates";

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

type Recipient = {
  email: string;
  recipientType: "client" | "realtor" | "custom";
  role: string;
};

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

  // Standalone environmental = radon/mold with NO home inspection. A combined
  // "home_radon_mold" CONTAINS the substring "radon_mold", so rule out anything
  // that also includes a home inspection first -- otherwise a home + radon + mold
  // client is emailed only the environmental report link.
  if (serviceType.includes("home")) return false;

  return serviceType.includes("radon") || serviceType.includes("mold");
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

function getRecipientTypeForRole(roleValue: any): "client" | "realtor" | "custom" {
  const role = String(roleValue || "").toLowerCase();

  if (role === "client" || role === "co-client" || role.includes("client")) {
    return "client";
  }

  if (
    role === "realtor" ||
    role === "agent" ||
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("transaction")
  ) {
    return "realtor";
  }

  return "custom";
}

function shouldReceiveReport(contact: any) {
  const role = String(contact?.role || "").toLowerCase();

  if (!contact?.email) return false;

  if (contact.portal_access === false) return false;

  return (
    role === "client" ||
    role === "co-client" ||
    role === "realtor" ||
    role === "agent" ||
    role === "transaction coordinator" ||
    role.includes("client") ||
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("transaction")
  );
}

function uniqueRecipients(recipients: Recipient[]) {
  const map = new Map<string, Recipient>();

  recipients.forEach((recipient) => {
    const email = cleanEmail(recipient.email);
    if (!email) return;

    if (!map.has(email)) {
      map.set(email, {
        ...recipient,
        email,
      });
    }
  });

  return Array.from(map.values());
}

async function logEmailEvent(
  supabase: any,
  {
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
  }
) {
  try {
    await supabase.from("email_logs").insert({
      // email_logs.inspection_id is a UUID column; the numeric inspection id
      // goes in inspection_id_bigint. Writing the number into inspection_id
      // makes the whole insert fail ("invalid input syntax for type uuid"),
      // which silently dropped every report email from the Sent Emails list.
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: metadata?.type || "inspection_report",
      subject,
      message: status === "sent" ? `Report email sent to ${recipient}.` : metadata?.error || "Report email send failed.",
      html: html || null,
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
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

async function sendReportEmail({
  supabase,
  inspection,
  inspectionId,
  appUrl,
  finalRecipient,
  recipientType,
  subject,
  finalShareUrl,
  trackedShareUrl,
  moldReportUrl,
  radonReportUrl,
  emailOpenPixelUrl,
  html,
  branding,
}: {
  supabase: any;
  inspection: any;
  inspectionId: any;
  appUrl: string;
  finalRecipient: string;
  recipientType: "client" | "realtor" | "custom";
  subject: string;
  finalShareUrl: string;
  trackedShareUrl: string;
  moldReportUrl: string;
  radonReportUrl: string;
  emailOpenPixelUrl: string;
  html: string;
  branding: CompanyBranding;
}) {
  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <reports@onpointhomeinspect.com>"
  );

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
        recipientType,
        error:
          resendData?.message ||
          "Email failed to send. Check Resend settings.",
        resendData,
        shareUrl: finalShareUrl,
        trackedShareUrl,
        moldReportUrl,
        radonReportUrl,
        emailOpenPixelUrl,
      },
    });

    return {
      ok: false,
      recipient: finalRecipient,
      recipientType,
      error:
        resendData?.message ||
        "Email failed to send. Check Resend settings.",
    };
  }

  await logEmailEvent(supabase, {
    inspectionId,
    recipient: finalRecipient,
    subject,
    status: "sent",
    resendId: resendData?.id || null,
    html,
    metadata: {
      type: isStandaloneEnvironmentalService(inspection)
        ? "environmental_report"
        : "inspection_report",
      recipientType,
      shareUrl: finalShareUrl,
      trackedShareUrl,
      moldReportUrl,
      radonReportUrl,
      emailOpenPixelUrl,
    },
  });

  return {
    ok: true,
    recipient: finalRecipient,
    recipientType,
    resendId: resendData?.id || null,
    shareUrl: finalShareUrl,
    trackedShareUrl,
  };
}

// Human label for what environmental results were posted, based on the
// inspection's services: "Radon", "Mold", "Radon & Mold", else "Environmental".
function environmentalResultLabel(inspection: any) {
  const mold = hasMoldService(inspection);
  const radon = hasRadonService(inspection);
  if (mold && radon) return "Radon & Mold";
  if (radon) return "Radon";
  if (mold) return "Mold";
  return "Environmental";
}

function buildEmailHtml({
  inspection,
  property,
  trackedShareUrl,
  emailOpenPixelUrl,
  moldReportUrl,
  radonReportUrl,
  branding,
  environmentalNotice = false,
}: {
  inspection: any;
  property: string;
  trackedShareUrl: string;
  emailOpenPixelUrl: string;
  moldReportUrl: string;
  radonReportUrl: string;
  branding: CompanyBranding;
  environmentalNotice?: boolean;
}) {
  const hasEnvironmentalLinks = Boolean(moldReportUrl || radonReportUrl);
  // Treat an explicit environmental notification the same as a standalone
  // environmental report for wording, so combined (home + radon/mold) reports
  // still read as "your radon/mold results" when posted from the env panel.
  const isEnvNotice =
    environmentalNotice || isStandaloneEnvironmentalService(inspection);
  const envLabel = environmentalResultLabel(inspection);

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

  return `
    <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
      <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
        <h1 style="color:#2dd4bf; margin-top:0;">${escapeHtml(branding.name)}</h1>

        <p>Hello,</p>

        <p>Your ${
          isEnvNotice
            ? `${envLabel} testing results`
            : "inspection report"
        } for:</p>

        <p style="font-size:18px; font-weight:bold; color:#ffffff;">
          ${escapeHtml(property)}
        </p>

        <p>is ready to review.</p>

        <p>
          <a href="${trackedShareUrl}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
            ${
              isEnvNotice
                ? "View Your Results"
                : "View Inspection Report"
            }
          </a>
        </p>

        ${environmentalLinksHtml}

        <p style="color:#cbd5e1; line-height:1.6;">
          This report is based on a visual, non-invasive inspection of readily accessible systems and components at the time of inspection.
        </p>

        <img
          src="${emailOpenPixelUrl}"
          width="1"
          height="1"
          alt=""
          style="width:1px;height:1px;max-width:1px;max-height:1px;border:0;line-height:1px;font-size:1px;"
        />

        <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />

        <p style="color:#94a3b8; font-size:14px;">
          ${escapeHtml(branding.name)}<br />
          ${escapeHtml(branding.tagline)}
        </p>
      </div>
    </div>
  `;
}

export async function POST(req: Request) {
  try {
    const { inspectionId, recipientType, recipientEmail, context } = await req.json();
    // When the send comes from the environmental panel's "Notify" button, word
    // the email around the radon/mold results (even for a combined report).
    const environmentalNotice = String(context || "").toLowerCase() === "environmental";

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

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (error || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const branding = await getCompanyBrandingById(inspection.company_id);

    const { data: contacts } = await supabase
      .from("inspection_contacts")
      .select("email, role, portal_access")
      .eq("inspection_id", inspectionId);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const shareToken = await getOrCreateShareToken(supabase, inspection);

    const finalShareUrl = isStandaloneEnvironmentalService(inspection)
      ? `${appUrl}/environmental-share/${shareToken}`
      : `${appUrl}/share/${shareToken}`;

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

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    const subject = environmentalNotice
      ? `Your ${environmentalResultLabel(inspection)} Testing Results Are Ready - ${property}`
      : isStandaloneEnvironmentalService(inspection)
        ? `Environmental Report Ready - ${property}`
        : `Inspection Report Ready - ${property}`;

    let recipients: Recipient[] = [];

    if (recipientEmail) {
      recipients = [
        {
          email: cleanEmail(recipientEmail),
          recipientType:
            recipientType === "client" || recipientType === "realtor"
              ? (recipientType as "client" | "realtor")
              : "custom",
          role: String(recipientType || "custom"),
        },
      ];
    } else if (recipientType === "all") {
      const contactRecipients: Recipient[] = (contacts || [])
        .filter(shouldReceiveReport)
        .map((contact: any) => ({
          email: cleanEmail(contact.email),
          recipientType: getRecipientTypeForRole(contact.role),
          role: String(contact.role || ""),
        }));

      const fallbackRecipients: Recipient[] = [
        {
          email: cleanEmail(inspection.client_email),
          recipientType: "client" as const,
          role: "client",
        },
        {
          email: cleanEmail(inspection.realtor_email || inspection.agent_email),
          recipientType: "realtor" as const,
          role: "realtor",
        },
      ].filter((recipient: Recipient) => Boolean(recipient.email));

      recipients = uniqueRecipients([...contactRecipients, ...fallbackRecipients]);
    } else if (recipientType === "client" || recipientType === "realtor") {
      const contact = (contacts || []).find((item: any) => {
        const role = String(item.role || "").toLowerCase();

        if (recipientType === "client") {
          return ["client", "co-client"].includes(role) && item.email;
        }

        return ["realtor", "agent", "transaction coordinator"].includes(role) && item.email;
      });

      const contactEmail = contact?.email || "";

      const finalRecipient =
        contactEmail ||
        (recipientType === "client"
          ? inspection.client_email
          : inspection.realtor_email || inspection.agent_email);

      if (finalRecipient) {
        recipients = [
          {
            email: cleanEmail(finalRecipient),
            recipientType,
            role: recipientType,
          },
        ];
      }
    }

    recipients = uniqueRecipients(recipients).filter((recipient) =>
      Boolean(recipient.email)
    );

    if (!recipients.length) {
      return NextResponse.json(
        { error: "No recipient email found." },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const recipient of recipients) {
      const recipientRoleForTracking = recipient.recipientType;

      const shareUrlWithViewer =
        `${finalShareUrl}?role=${encodeURIComponent(
          recipientRoleForTracking
        )}&email=${encodeURIComponent(recipient.email)}`;

      const trackedShareUrl =
        `${appUrl}/api/email-click?inspection_id=${encodeURIComponent(
          String(inspectionId)
        )}&recipient_type=${encodeURIComponent(
          recipientRoleForTracking
        )}&recipient_email=${encodeURIComponent(
          recipient.email
        )}&target=${encodeURIComponent(shareUrlWithViewer)}`;

      const emailOpenPixelUrl =
        `${appUrl}/api/email-open?inspection_id=${encodeURIComponent(
          String(inspectionId)
        )}&recipient_type=${encodeURIComponent(
          recipientRoleForTracking
        )}&recipient_email=${encodeURIComponent(
          recipient.email
        )}&email_type=${encodeURIComponent(
          isStandaloneEnvironmentalService(inspection)
            ? "environmental_report"
            : "inspection_report"
        )}`;

      const html = buildEmailHtml({
        inspection,
        property,
        trackedShareUrl,
        emailOpenPixelUrl,
        moldReportUrl,
        radonReportUrl,
        branding,
        environmentalNotice,
      });

      const result = await sendReportEmail({
        supabase,
        inspection,
        inspectionId,
        appUrl,
        finalRecipient: recipient.email,
        recipientType: recipient.recipientType,
        subject,
        finalShareUrl,
        trackedShareUrl,
        moldReportUrl,
        radonReportUrl,
        emailOpenPixelUrl,
        html,
        branding,
      });

      results.push(result);
    }

    // Best-effort: also text the report link to any recipient with a phone on
    // file. Never blocks or fails the email response.
    if (isSmsConfigured()) {
      for (const recipient of recipients) {
        const phone =
          recipient.recipientType === "client"
            ? inspection.client_phone
            : recipient.recipientType === "realtor"
              ? inspection.realtor_phone || inspection.agent_phone
              : null;

        if (!phone) continue;

        const link = `${finalShareUrl}?role=${encodeURIComponent(
          recipient.recipientType
        )}`;

        const body =
          recipient.recipientType === "realtor"
            ? smsReportReadyAgent({ company: branding.name, address: property, link })
            : smsReportReadyClient({ company: branding.name, address: property, link });

        await sendSms({ to: phone, body }).catch(() => null);
      }
    }

    const sent = results.filter((item) => item.ok);
    const failed = results.filter((item) => !item.ok);

    await logAuditEvent(supabase, {
      userId: user.id,
      action: isStandaloneEnvironmentalService(inspection)
        ? "environmental_report_email_sent"
        : "report_email_sent",
      resourceType: "inspection",
      resourceId: inspectionId,
      metadata: {
        recipientType,
        sent: sent.map((item) => item.recipient),
        failed,
        subject,
        shareUrl: finalShareUrl,
      },
    });

    if (!sent.length && failed.length) {
      return NextResponse.json(
        {
          error: "Report email failed to send.",
          sent,
          failed,
        },
        { status: 500 }
      );
    }

    // Fire the report.sent webhook (best-effort) to the inspector's endpoints.
    if (inspection?.inspector_id && sent.length) {
      const hookAdmin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      void emitWebhook(hookAdmin, {
        ownerUserId: String(inspection.inspector_id),
        event: "report.sent",
        data: {
          inspection_id: inspection.id,
          property_address: inspection.property_address || inspection.address || null,
          recipients: sent.map((s: any) => s.recipient),
          share_url: finalShareUrl || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        recipientType === "all"
          ? `Report email sent to ${sent.length} recipient${
              sent.length === 1 ? "" : "s"
            }.`
          : `Report email sent to ${sent[0]?.recipient || recipients[0]?.email}.`,
      sent,
      failed,
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
