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

type Recipient = {
  email: string;
  recipientType: "client" | "realtor" | "custom";
  role: string;
};

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
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

function shouldReceiveRepairRequest(contact: any) {
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
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "repair_request",
      subject,
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });
  } catch (error) {
    console.error("Repair request email log insert failed:", error);
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
    console.error("Repair request audit log insert failed:", error);
  }
}

function buildRepairRequestEmailHtml({
  property,
  trackedRepairRequestUrl,
  summary,
  selectedCount,
}: {
  property: string;
  trackedRepairRequestUrl: string;
  summary: string;
  selectedCount: number;
  emailOpenPixelUrl?: string;
}) {
  return `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
    <div style="max-width:680px; margin:0 auto; padding:24px;">
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; padding:24px;">
        <h1 style="margin:0 0 10px 0; color:#0f8f8f; font-size:26px;">
          On Point Home Inspections
        </h1>

        <p style="font-size:16px; line-height:1.5; margin:0 0 16px 0;">
          Hello,
        </p>

        <p style="font-size:16px; line-height:1.5; margin:0 0 8px 0;">
          The repair request summary for:
        </p>

        <p style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 18px 0;">
          ${escapeHtml(property)}
        </p>

        <p style="font-size:16px; line-height:1.5; margin:0 0 22px 0;">
          is ready to review.
        </p>

        <p style="margin:0 0 24px 0;">
          <a href="${escapeHtml(trackedRepairRequestUrl)}" style="display:inline-block; background:#14b8a6; color:#020617; padding:14px 20px; border-radius:10px; text-decoration:none; font-weight:700;">
            View Repair Request
          </a>
        </p>

        <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:12px; padding:18px; margin:0 0 22px 0;">
          <h2 style="font-size:18px; margin:0 0 10px 0; color:#0f172a;">
            Repair Request Summary
          </h2>

          <p style="font-size:15px; line-height:1.5; margin:0 0 10px 0;">
            Selected repair request items: <strong>${selectedCount}</strong>
          </p>

          <p style="font-size:15px; line-height:1.6; margin:0; color:#334155;">
            ${escapeHtml(summary)}
          </p>
        </div>

        <p style="font-size:15px; line-height:1.6; margin:0 0 16px 0; color:#334155;">
          Please review the requested repair/correction items and advise on next steps.
        </p>

        <p style="font-size:13px; line-height:1.5; color:#64748b; margin:22px 0 0 0;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${escapeHtml(trackedRepairRequestUrl)}" style="color:#0f8f8f; word-break:break-all;">
            ${escapeHtml(trackedRepairRequestUrl)}
          </a>
        </p>

        <hr style="border:0; border-top:1px solid #cbd5e1; margin:24px 0;" />

        <p style="color:#64748b; font-size:14px; margin:0;">
          On Point Home Inspections LLC<br />
          Protecting Your Investment. One Inspection at a Time.
        </p>
      </div>
    </div>
  </body>
</html>
  `;
}

function buildRepairRequestEmailText({
  property,
  repairRequestUrl,
  summary,
  selectedCount,
}: {
  property: string;
  repairRequestUrl: string;
  summary: string;
  selectedCount: number;
}) {
  return `Hello,

The repair request summary for ${property} is ready to review.

View Repair Request:
${repairRequestUrl}

Selected repair request items: ${selectedCount}

${summary}

Please review the requested repair/correction items and advise on next steps.

On Point Home Inspections LLC
Protecting Your Investment. One Inspection at a Time.`;
}

export async function POST(req: Request) {
  try {
    const {
      inspectionId,
      recipientType = "realtor",
      recipientEmail,
      selectedIds = [],
      summary = "",
    } = await req.json();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("inspector_id", user.id)
      .single();

    if (error || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const { data: contacts } = await supabase
      .from("inspection_contacts")
      .select("email, role, portal_access")
      .eq("inspection_id", inspectionId);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    let recipients: Recipient[] = [];

    if (recipientEmail) {
      recipients = [
        {
          email: cleanEmail(recipientEmail),
          recipientType:
            recipientType === "client" || recipientType === "realtor"
              ? recipientType
              : "custom",
          role: String(recipientType || "custom"),
        },
      ];
    } else if (recipientType === "all") {
      const contactRecipients: Recipient[] = (contacts || [])
        .filter(shouldReceiveRepairRequest)
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

      const finalRecipient =
        contact?.email ||
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

    recipients = uniqueRecipients(recipients).filter((recipient) => Boolean(recipient.email));

    if (!recipients.length) {
      return NextResponse.json({ error: "No recipient email found." }, { status: 400 });
    }

    let finalSelectedIds = Array.isArray(selectedIds)
      ? selectedIds.map((id: any) => String(id)).filter(Boolean)
      : [];

    if (!finalSelectedIds.length) {
      const { data: findingsRaw } = await supabase
        .from("findings")
        .select("id, section, title")
        .eq("inspection_id", inspectionId);

      finalSelectedIds = (findingsRaw || [])
        .filter((finding: any) => {
          const section = String(finding?.section || "").toLowerCase();
          const title = String(finding?.title || "").toLowerCase();

          if (section === "inspection details") return false;
          if (section === "disclaimers") return false;

          return ![
            "in attendance",
            "occupancy",
            "style",
            "temperature",
            "type of building",
            "weather conditions",
          ].includes(title);
        })
        .map((finding: any) => String(finding.id));
    }

    const selectedParam = finalSelectedIds.join(",");

    const baseRepairRequestUrl = `${appUrl}/repair-request?inspection_id=${encodeURIComponent(String(inspectionId))}${
      selectedParam ? `&selected=${encodeURIComponent(selectedParam)}` : ""
    }`;

    const subject = `Repair Request Summary - ${property}`;
    const from =
      process.env.REPORT_EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <reports@onpointhomeinspect.com>";

    const results: any[] = [];

    for (const recipient of recipients) {
      const repairUrlWithViewer = `${baseRepairRequestUrl}&role=${encodeURIComponent(
        recipient.recipientType
      )}&email=${encodeURIComponent(recipient.email)}`;

      const trackedRepairRequestUrl = `${appUrl}/api/email-click?inspection_id=${encodeURIComponent(
        String(inspectionId)
      )}&recipient_type=${encodeURIComponent(
        recipient.recipientType
      )}&recipient_email=${encodeURIComponent(
        recipient.email
      )}&target=${encodeURIComponent(repairUrlWithViewer)}`;

      const emailOpenPixelUrl = `${appUrl}/api/email-open?inspection_id=${encodeURIComponent(
        String(inspectionId)
      )}&recipient_type=${encodeURIComponent(
        recipient.recipientType
      )}&recipient_email=${encodeURIComponent(recipient.email)}`;

      const finalSummary =
        summary ||
        "The selected inspection findings are ready for repair request review and negotiation.";

      const html = buildRepairRequestEmailHtml({
        property,
        trackedRepairRequestUrl,
        summary: finalSummary,
        selectedCount: finalSelectedIds.length,
        emailOpenPixelUrl,
      });

      const text = buildRepairRequestEmailText({
        property,
        repairRequestUrl: repairUrlWithViewer,
        summary: finalSummary,
        selectedCount: finalSelectedIds.length,
      });

      console.log("Repair request email payload", {
        to: recipient.email,
        subject,
        htmlLength: html.length,
        textLength: text.length,
        repairUrlWithViewer,
        trackedRepairRequestUrl,
      });

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: recipient.email,
          subject,
          html,
          text,
        }),
      });

      const resendText = await resendRes.text();
      let resendData: any = {};

      try {
        resendData = resendText ? JSON.parse(resendText) : {};
      } catch {
        resendData = { raw: resendText };
      }

      console.log("Repair request Resend response", {
        status: resendRes.status,
        ok: resendRes.ok,
        recipient: recipient.email,
        resendData,
      });

      if (!resendRes.ok || !resendData?.id) {
        await logEmailEvent(supabase, {
          inspectionId,
          recipient: recipient.email,
          subject,
          status: "failed",
          metadata: {
            type: "repair_request",
            recipientType: recipient.recipientType,
            error:
              resendData?.message ||
              resendData?.error ||
              (!resendData?.id ? "Resend did not return an email ID." : "Repair request email failed to send."),
            resendData,
            repairRequestUrl: baseRepairRequestUrl,
            trackedRepairRequestUrl,
          },
        });

        results.push({
          ok: false,
          recipient: recipient.email,
          recipientType: recipient.recipientType,
          error:
              resendData?.message ||
              resendData?.error ||
              (!resendData?.id ? "Resend did not return an email ID." : "Repair request email failed to send."),
        });

        continue;
      }

      await logEmailEvent(supabase, {
        inspectionId,
        recipient: recipient.email,
        subject,
        status: "sent",
        resendId: resendData?.id || null,
        metadata: {
          type: "repair_request",
          recipientType: recipient.recipientType,
          repairRequestUrl: baseRepairRequestUrl,
          trackedRepairRequestUrl,
        },
      });

      results.push({
        ok: true,
        recipient: recipient.email,
        recipientType: recipient.recipientType,
        resendId: resendData?.id || null,
        repairRequestUrl: baseRepairRequestUrl,
        trackedRepairRequestUrl,
      });
    }

    const sent = results.filter((item) => item.ok);
    const failed = results.filter((item) => !item.ok);

    await logAuditEvent(supabase, {
      userId: user.id,
      action: "repair_request_email_sent",
      resourceType: "inspection",
      resourceId: inspectionId,
      metadata: {
        recipientType,
        selectedIds: finalSelectedIds,
        sent: sent.map((item) => item.recipient),
        failed,
        subject,
        repairRequestUrl: baseRepairRequestUrl,
      },
    });

    if (!sent.length && failed.length) {
      return NextResponse.json(
        {
          error: "Repair request email failed to send.",
          sent,
          failed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        recipientType === "all"
          ? `Repair request sent to ${sent.length} recipient${sent.length === 1 ? "" : "s"}.`
          : `Repair request sent to ${sent[0]?.recipient || recipients[0]?.email}.`,
      sent,
      failed,
      repairRequestUrl: baseRepairRequestUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Repair request email failed to send." },
      { status: 500 }
    );
  }
}
