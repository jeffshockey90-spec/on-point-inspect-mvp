import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

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

function createDatabaseClient(fallbackClient: any) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return fallbackClient;
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

function looksLikeEmail(value: any) {
  const email = cleanEmail(value);
  return Boolean(email && email.includes("@") && email.includes("."));
}

function getRecipientTypeForRole(roleValue: any): "client" | "realtor" | "custom" {
  const role = String(roleValue || "").toLowerCase();

  if (role === "client" || role === "co-client" || role.includes("client")) return "client";

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

  if (!looksLikeEmail(contact?.email)) return false;
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
    if (!looksLikeEmail(email)) return;

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
  trackedResponseUrl,
  summary,
  selectedCount,
}: {
  property: string;
  trackedRepairRequestUrl: string;
  trackedResponseUrl: string;
  summary: string;
  selectedCount: number;
}) {
  return `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
    <div style="max-width:680px; margin:0 auto; padding:24px;">
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; padding:24px;">
        <h1 style="margin:0 0 10px 0; color:#0f8f8f; font-size:26px;">On Point Home Inspections</h1>
        <p style="font-size:16px; line-height:1.5; margin:0 0 16px 0;">Hello,</p>
        <p style="font-size:16px; line-height:1.5; margin:0 0 8px 0;">The repair request summary for:</p>
        <p style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 18px 0;">${escapeHtml(property)}</p>
        <p style="font-size:16px; line-height:1.5; margin:0 0 22px 0;">is ready to review and respond to.</p>
        <p style="margin:0 0 12px 0;">
          <a href="${escapeHtml(trackedResponseUrl)}" style="display:inline-block; background:#14b8a6; color:#020617; padding:14px 20px; border-radius:10px; text-decoration:none; font-weight:700;">Respond to Repair Request</a>
        </p>
        <p style="margin:0 0 24px 0;">
          <a href="${escapeHtml(trackedRepairRequestUrl)}" style="display:inline-block; background:#020617; color:#5eead4; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">View Printable Request</a>
        </p>
        <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:12px; padding:18px; margin:0 0 22px 0;">
          <h2 style="font-size:18px; margin:0 0 10px 0; color:#0f172a;">Repair Request Summary</h2>
          <p style="font-size:15px; line-height:1.5; margin:0 0 10px 0;">Selected repair request items: <strong>${selectedCount}</strong></p>
          <p style="font-size:15px; line-height:1.6; margin:0; color:#334155;">${escapeHtml(summary)}</p>
        </div>
        <p style="font-size:15px; line-height:1.6; margin:0 0 16px 0; color:#334155;">Please review the requested repair/correction items and submit a response for each item.</p>
        <p style="font-size:13px; line-height:1.5; color:#64748b; margin:22px 0 0 0;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${escapeHtml(trackedResponseUrl)}" style="color:#0f8f8f; word-break:break-all;">${escapeHtml(trackedResponseUrl)}</a>
        </p>
        <hr style="border:0; border-top:1px solid #cbd5e1; margin:24px 0;" />
        <p style="color:#64748b; font-size:14px; margin:0;">On Point Home Inspections LLC<br />Protecting Your Investment. One Inspection at a Time.</p>
      </div>
    </div>
  </body>
</html>`;
}

function buildRepairRequestEmailText({
  property,
  repairRequestUrl,
  responseUrl,
  summary,
  selectedCount,
}: {
  property: string;
  repairRequestUrl: string;
  responseUrl: string;
  summary: string;
  selectedCount: number;
}) {
  return `Hello,

The repair request summary for ${property} is ready to review and respond to.

Respond to Repair Request:
${responseUrl}

View Printable Request:
${repairRequestUrl}

Selected repair request items: ${selectedCount}

${summary}

Please review the requested repair/correction items and submit a response for each item.

On Point Home Inspections LLC
Protecting Your Investment. One Inspection at a Time.`;
}

function collectEmailsFromInspection(inspection: any, recipientType: string): Recipient[] {
  const recipients: Recipient[] = [];

  const clientFields = [
    inspection?.client_email,
    inspection?.clientEmail,
    inspection?.buyer_email,
    inspection?.buyerEmail,
  ];

  const realtorFields = [
    inspection?.realtor_email,
    inspection?.agent_email,
    inspection?.realtorEmail,
    inspection?.agentEmail,
  ];

  if (recipientType === "client" || recipientType === "all") {
    clientFields.forEach((email) => {
      if (looksLikeEmail(email)) {
        recipients.push({ email: cleanEmail(email), recipientType: "client", role: "client" });
      }
    });
  }

  if (recipientType === "realtor" || recipientType === "all") {
    realtorFields.forEach((email) => {
      if (looksLikeEmail(email)) {
        recipients.push({ email: cleanEmail(email), recipientType: "realtor", role: "realtor" });
      }
    });
  }

  return recipients;
}

function collectEmailsFromContacts(contacts: any[], recipientType: string): Recipient[] {
  const cleanContacts = Array.isArray(contacts) ? contacts : [];

  if (recipientType === "all") {
    return cleanContacts
      .filter(shouldReceiveRepairRequest)
      .map((contact: any) => ({
        email: cleanEmail(contact.email),
        recipientType: getRecipientTypeForRole(contact.role),
        role: String(contact.role || "contact"),
      }));
  }

  if (recipientType === "client") {
    return cleanContacts
      .filter((contact: any) => {
        const role = String(contact?.role || "").toLowerCase();
        return looksLikeEmail(contact?.email) && contact.portal_access !== false && role.includes("client");
      })
      .map((contact: any) => ({
        email: cleanEmail(contact.email),
        recipientType: "client" as const,
        role: String(contact.role || "client"),
      }));
  }

  if (recipientType === "realtor") {
    return cleanContacts
      .filter((contact: any) => {
        const role = String(contact?.role || "").toLowerCase();
        return (
          looksLikeEmail(contact?.email) &&
          contact.portal_access !== false &&
          (role.includes("realtor") || role.includes("agent") || role.includes("transaction"))
        );
      })
      .map((contact: any) => ({
        email: cleanEmail(contact.email),
        recipientType: "realtor" as const,
        role: String(contact.role || "realtor"),
      }));
  }

  return [];
}

export async function POST(req: Request) {
  let inspectionId: any = null;
  let subject = "Repair Request Summary";
  let supabaseForLogs: any = null;

  try {
    const body = await req.json();
    const {
      inspectionId: incomingInspectionId,
      recipientType = "realtor",
      recipientEmail,
      selectedIds = [],
      summary = "",
    } = body;

    inspectionId = incomingInspectionId;

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const authClient = await createSupabaseServerClient();
    const db = createDatabaseClient(authClient);
    supabaseForLogs = db;

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: inspection, error: inspectionError } = await db
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const { data: contactsRaw, error: contactsError } = await db
      .from("inspection_contacts")
      .select("*")
      .eq("inspection_id", inspectionId);

    const contacts = contactsError ? [] : contactsRaw || [];

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const property = inspection.property_address || inspection.address || "the inspected property";

    let recipients: Recipient[] = [];

    if (looksLikeEmail(recipientEmail)) {
      recipients.push({
        email: cleanEmail(recipientEmail),
        recipientType:
          recipientType === "client" || recipientType === "realtor" ? recipientType : "custom",
        role: String(recipientType || "custom"),
      });
    }

    if (!recipients.length) {
      recipients = collectEmailsFromContacts(contacts, recipientType);
    }

    if (!recipients.length) {
      recipients = collectEmailsFromInspection(inspection, recipientType);
    }

    if (!recipients.length && contacts.length === 1 && looksLikeEmail(contacts[0]?.email)) {
      recipients = [
        {
          email: cleanEmail(contacts[0].email),
          recipientType: getRecipientTypeForRole(contacts[0].role),
          role: String(contacts[0].role || "contact"),
        },
      ];
    }

    recipients = uniqueRecipients(recipients);

    if (!recipients.length) {
      return NextResponse.json({ error: "No recipient email found." }, { status: 400 });
    }

    let finalSelectedIds = Array.isArray(selectedIds)
      ? selectedIds.map((id: any) => String(id)).filter(Boolean)
      : [];

    if (!finalSelectedIds.length) {
      const { data: findingsRaw } = await db
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

    subject = `Repair Request Summary - ${property}`;
    const from =
      process.env.REPORT_EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <reports@onpointhomeinspect.com>";

    const finalSummary =
      summary || "The selected inspection findings are ready for repair request review and negotiation.";

    const results: any[] = [];

    for (const recipient of recipients) {
      const token = crypto.randomBytes(32).toString("hex");

      const { data: share, error: shareError } = await db
        .from("repair_request_shares")
        .insert({
          inspection_id: Number(inspectionId),
          token,
          recipient_email: recipient.email,
          recipient_type: recipient.recipientType,
          selected_finding_ids: finalSelectedIds,
          summary: finalSummary,
          status: "sent",
        })
        .select("id, token")
        .single();

      if (shareError || !share?.token) {
        console.error("Repair request share create error:", shareError);

        results.push({
          ok: false,
          recipient: recipient.email,
          recipientType: recipient.recipientType,
          error: shareError?.message || "Could not create secure repair request link.",
        });

        continue;
      }

      const repairUrlWithViewer = `${baseRepairRequestUrl}&role=${encodeURIComponent(
        recipient.recipientType
      )}&email=${encodeURIComponent(recipient.email)}&share=${encodeURIComponent(String(share.id))}`;

      const responseUrl = `${appUrl}/repair-response/${encodeURIComponent(share.token)}`;

      const trackedRepairRequestUrl = `${appUrl}/api/email-click?inspection_id=${encodeURIComponent(
        String(inspectionId)
      )}&recipient_type=${encodeURIComponent(
        recipient.recipientType
      )}&recipient_email=${encodeURIComponent(
        recipient.email
      )}&target=${encodeURIComponent(repairUrlWithViewer)}`;

      const trackedResponseUrl = `${appUrl}/api/email-click?inspection_id=${encodeURIComponent(
        String(inspectionId)
      )}&recipient_type=${encodeURIComponent(
        recipient.recipientType
      )}&recipient_email=${encodeURIComponent(
        recipient.email
      )}&target=${encodeURIComponent(responseUrl)}`;

      const html = buildRepairRequestEmailHtml({
        property,
        trackedRepairRequestUrl,
        trackedResponseUrl,
        summary: finalSummary,
        selectedCount: finalSelectedIds.length,
      });

      const text = buildRepairRequestEmailText({
        property,
        repairRequestUrl: repairUrlWithViewer,
        responseUrl,
        summary: finalSummary,
        selectedCount: finalSelectedIds.length,
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

      if (!resendRes.ok || !resendData?.id) {
        await db
          .from("repair_request_shares")
          .update({ status: "failed" })
          .eq("id", share.id);

        await logEmailEvent(db, {
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
            responseUrl,
            repairRequestShareId: share.id,
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

      await logEmailEvent(db, {
        inspectionId,
        recipient: recipient.email,
        subject,
        status: "sent",
        resendId: resendData?.id || null,
        metadata: {
          type: "repair_request",
          recipientType: recipient.recipientType,
          repairRequestUrl: baseRepairRequestUrl,
          responseUrl,
          repairRequestShareId: share.id,
        },
      });

      results.push({
        ok: true,
        recipient: recipient.email,
        recipientType: recipient.recipientType,
        resendId: resendData?.id || null,
        repairRequestUrl: baseRepairRequestUrl,
        responseUrl,
        repairRequestShareId: share.id,
      });
    }

    const sent = results.filter((item) => item.ok);
    const failed = results.filter((item) => !item.ok);

    await logAuditEvent(db, {
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
      responseUrl: sent[0]?.responseUrl || null,
    });
  } catch (error: any) {
    if (supabaseForLogs && inspectionId) {
      try {
        await logEmailEvent(supabaseForLogs, {
          inspectionId,
          recipient: "unknown",
          subject,
          status: "failed",
          metadata: {
            type: "repair_request",
            error: error?.message || "Repair request email failed to send.",
          },
        });
      } catch {}
    }

    return NextResponse.json(
      { error: error?.message || "Repair request email failed to send." },
      { status: 500 }
    );
  }
}
