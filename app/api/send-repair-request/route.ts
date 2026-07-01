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
  emailOpenPixelUrl,
}: {
  property: string;
  trackedRepairRequestUrl: string;
  summary: string;
  selectedCount: number;
  emailOpenPixelUrl: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
      <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
        <h1 style="color:#2dd4bf; margin-top:0;">On Point Home Inspections</h1>

        <p>Hello,</p>

        <p>The repair request summary for:</p>

        <p style="font-size:18px; font-weight:bold; color:#ffffff;">
          ${escapeHtml(property)}
        </p>

        <p>is ready to review.</p>

        <p style="margin:24px 0;">
          <a href="${escapeHtml(trackedRepairRequestUrl)}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
            View Repair Request
          </a>
        </p>

        <div style="margin-top:22px; padding:18px; border:1px solid #334155; border-radius:14px; background:#020617;">
          <h2 style="margin:0 0 12px 0; color:#2dd4bf; font-size:20px;">
            Repair Request Summary
          </h2>
          <p style="color:#cbd5e1; line-height:1.6; margin:0 0 12px 0;">
            Selected repair request items: <strong style="color:#ffffff;">${selectedCount}</strong>
          </p>
          <p style="color:#cbd5e1; line-height:1.6; margin:0;">
            ${escapeHtml(summary)}
          </p>
        </div>

        <p style="color:#cbd5e1; line-height:1.6; margin-top:22px;">
          Please review the requested repair/correction items and advise on next steps.
        </p>

        <img
          src="${emailOpenPixelUrl}"
          width="1"
          height="1"
          alt=""
          style="display:none; opacity:0; width:1px; height:1px;"
        />

        <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />

        <p style="color:#94a3b8; font-size:14px;">
          On Point Home Inspections LLC<br />
          Protecting Your Investment. One Inspection at a Time.
        </p>
      </div>
    </div>
  `;
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

    const selectedParam = Array.isArray(selectedIds)
      ? selectedIds.map((id: any) => String(id)).filter(Boolean).join(",")
      : "";

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

      const html = buildRepairRequestEmailHtml({
        property,
        trackedRepairRequestUrl,
        summary:
          summary ||
          "The selected inspection findings are ready for repair request review and negotiation.",
        selectedCount: Array.isArray(selectedIds) ? selectedIds.length : 0,
        emailOpenPixelUrl,
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
        selectedIds,
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
