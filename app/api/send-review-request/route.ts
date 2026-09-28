import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

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

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
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

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

async function sendOwnerPushNotification({
  title,
  body,
  url,
  eventType,
  metadata = {},
}: {
  title: string;
  body: string;
  url: string;
  eventType: string;
  metadata?: Record<string, any>;
}) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject =
      process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

    if (!publicKey || !privateKey) {
      console.warn("Owner push skipped: missing VAPID keys.");
      return;
    }

    const admin = createAdminClient();
    const { data: subscriptions, error } = await admin
      .from("app_push_subscriptions")
      .select("*")
      .eq("enabled", true);

    if (error) {
      console.error("Owner push subscription load error:", error);
      return;
    }

    const webpush = await import("web-push");
    webpush.default.setVapidDetails(subject, publicKey, privateKey);

    let sent = 0;
    let failed = 0;

    for (const row of subscriptions || []) {
      try {
        await webpush.default.sendNotification(
          row.subscription,
          JSON.stringify({ title, body, url, eventType })
        );
        sent += 1;
      } catch (error: any) {
        failed += 1;
        console.error("Owner push send error:", error);

        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await admin
            .from("app_push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("endpoint", row.endpoint);
        }
      }
    }

    await admin.from("app_notification_logs").insert({
      title,
      body,
      event_type: eventType,
      target_url: url,
      sent_count: sent,
      failed_count: failed,
      metadata,
    });
  } catch (error) {
    console.error("Owner push notification error:", error);
  }
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
      // inspection_id is a UUID column; the numeric id goes in inspection_id_bigint.
      inspection_id_bigint: Number(inspectionId),
      recipient,
      recipient_email: recipient,
      email_type: "review_request",
      subject,
      message: status === "sent" ? `Review request sent to ${recipient}.` : metadata?.error || "Review request send failed.",
      html: html || null,
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });
  } catch (error) {
    console.error("Review request email log insert failed:", error);
  }
}

async function logAuditEvent(
  supabase: any,
  {
    userId,
    inspectionId,
    recipient,
  }: {
    userId: string;
    inspectionId: any;
    recipient: string;
  }
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "review_request_sent",
      resource_type: "inspection",
      resource_id: String(inspectionId),
      metadata: {
        recipient,
      },
    });
  } catch (error) {
    console.error("Review request audit log insert failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { inspectionId, recipientEmail, recipientEmails, recipientType: recipientTypeRaw } =
      await req.json();
    const recipientType =
      String(recipientTypeRaw || "client").toLowerCase() === "realtor"
        ? "realtor"
        : "client";

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

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const branding = await getCompanyBrandingById(inspection.company_id);

    // Use the company's OWN Google review link (saved when they connect their
    // Google Business Profile) rather than a global env var. Prefer the g.page
    // short link, then a Place-ID write-review link, then the env var. This
    // fixes review requests that were sending a copied Google *search* URL
    // (session-scoped, not an actual "leave a review" link).
    const admin = createAdminClient();
    const { data: reviewCompany } = await admin
      .from("companies")
      .select("google_review_url, google_place_id")
      .eq("id", inspection.company_id)
      .maybeSingle();

    const googleReviewUrl =
      (reviewCompany?.google_review_url &&
        String(reviewCompany.google_review_url).trim()) ||
      (reviewCompany?.google_place_id
        ? `https://search.google.com/local/writereview?placeid=${reviewCompany.google_place_id}`
        : "") ||
      process.env.GOOGLE_REVIEW_URL ||
      process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
      "";

    if (!googleReviewUrl) {
      return NextResponse.json(
        {
          error:
            "No Google review link is set. Connect your Google Business Profile in Settings so review requests can link to your review page.",
        },
        { status: 400 }
      );
    }

    const explicitEmail = String(recipientEmail || "").trim();
    const explicitList: string[] = Array.isArray(recipientEmails)
      ? Array.from(
          new Set(
            recipientEmails
              .map((value: any) => String(value || "").trim())
              .filter(Boolean)
          )
        )
      : [];

    const { data: contacts } = await supabase
      .from("inspection_contacts")
      .select("email, role, name")
      .eq("inspection_id", inspectionId);

    const contactByEmail = new Map<string, any>();
    (contacts || []).forEach((c: any) => {
      const key = String(c.email || "").trim().toLowerCase();
      if (key) contactByEmail.set(key, c);
    });

    const isAgentRole = (role: any) =>
      /realtor|agent|transaction/.test(String(role || "").toLowerCase());

    // Build the recipient list. Each recipient carries its own wording type so a
    // mixed selection (e.g. two agents + one buyer) gets the right email each.
    type Target = { email: string; name: string; type: "client" | "realtor" };
    const seenEmails = new Set<string>();
    const targets: Target[] = [];
    const addTarget = (email: any, name: any, type: "client" | "realtor") => {
      const cleanEmail = String(email || "").trim();
      if (!cleanEmail) return;
      const key = cleanEmail.toLowerCase();
      if (seenEmails.has(key)) return;
      seenEmails.add(key);
      targets.push({ email: cleanEmail, name: String(name || "").trim(), type });
    };

    if (explicitList.length) {
      // Explicit multi-select from the UI — send to exactly these people, with
      // wording chosen per person from their contact role.
      explicitList.forEach((email) => {
        const c = contactByEmail.get(email.toLowerCase());
        addTarget(email, c?.name, c && isAgentRole(c.role) ? "realtor" : "client");
      });
    } else if (explicitEmail) {
      const c = contactByEmail.get(explicitEmail.toLowerCase());
      addTarget(explicitEmail, c?.name, recipientType);
    } else if (recipientType === "realtor") {
      (contacts || []).forEach((c: any) => {
        if (isAgentRole(c.role)) addTarget(c.email, c.name, "realtor");
      });
      if (targets.length === 0) {
        addTarget(inspection.realtor_email, inspection.realtor_name, "realtor");
        addTarget(inspection.agent_email, inspection.agent_name, "realtor");
        addTarget(inspection.buyer_agent_email, "", "realtor");
      }
    } else {
      // Every buyer/client on the contract gets the request.
      (contacts || []).forEach((c: any) => {
        const role = String(c.role || "").toLowerCase();
        if (["client", "co-client", "buyer", "co-buyer"].includes(role)) {
          addTarget(c.email, c.name, "client");
        }
      });
      if (targets.length === 0) {
        addTarget(inspection.client_email, inspection.client_name || inspection.client, "client");
        addTarget(inspection.email, inspection.client_name || inspection.client, "client");
      }
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No email found for the selected recipients." },
        { status: 400 }
      );
    }

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    const joinNames = (names: string[]) => {
      const list = names.filter(Boolean);
      if (list.length === 0) return "there";
      if (list.length === 1) return list[0];
      if (list.length === 2) return `${list[0]} and ${list[1]}`;
      return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
    };

    const buildReviewEmail = (type: "client" | "realtor", recipientName: string) => {
      const subject =
        type === "realtor"
          ? `Thanks for trusting ${branding.name} with your client`
          : `Thank you for choosing ${branding.name}`;

      const introLine =
        type === "realtor"
          ? `Thank you for referring your client to ${escapeHtml(
              branding.name
            )} for the inspection at:`
          : `Thank you for choosing ${escapeHtml(branding.name)} for:`;

      const askLine =
        type === "realtor"
          ? `If your client had a great experience, a quick Google review would mean a lot &mdash; and it helps other agents find an inspector they can rely on for their deals.`
          : `If you were happy with your inspection experience, would you mind leaving a quick Google review? Reviews help other homeowners and real estate professionals find a reliable inspector.`;

      const outroLine =
        type === "realtor"
          ? `Thank you for the referral and for trusting us with your client.`
          : `I appreciate your business and the opportunity to help protect your investment.`;

      const html = `
      <div style="font-family: Arial, sans-serif; background:#020617; color:#f8fafc; padding:24px;">
        <div style="max-width:640px; margin:auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
          <h1 style="color:#2dd4bf; margin-top:0;">${escapeHtml(branding.name)}</h1>

          <p>Hello ${escapeHtml(recipientName)},</p>

          <p style="line-height:1.6;">
            ${introLine}
          </p>

          <p style="font-size:18px; font-weight:bold; color:#ffffff;">
            ${escapeHtml(property)}
          </p>

          <p style="line-height:1.6;">
            ${askLine}
          </p>

          <p style="margin:24px 0;">
            <a href="${escapeHtml(
              googleReviewUrl
            )}" style="display:inline-block; background:#14b8a6; color:#020617; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:bold;">
              Leave a Google Review
            </a>
          </p>

          <p style="color:#cbd5e1; line-height:1.6;">
            ${outroLine}
          </p>

          <hr style="border:0; border-top:1px solid #334155; margin:24px 0;" />

          <p style="color:#94a3b8; font-size:14px;">
            ${escapeHtml(branding.name)}<br />
            ${escapeHtml(branding.tagline)}
          </p>
        </div>
      </div>
    `;

      return { subject, html };
    };

    const from = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <reports@onpointhomeinspect.com>"
    );

    const sentEmails: string[] = [];
    const failedEmails: string[] = [];
    let firstError = "";
    let sentClient = false;

    // Send one email per wording group (buyers vs agents), each to its own
    // recipients, so mixed selections read correctly for everyone.
    for (const type of ["client", "realtor"] as const) {
      const group = targets.filter((t) => t.type === type);
      if (group.length === 0) continue;

      const emails = group.map((g) => g.email);
      const emailsCsv = emails.join(", ");
      const recipientName = joinNames(group.map((g) => g.name));
      const { subject, html } = buildReviewEmail(type, recipientName);

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: emails, subject, html }),
        });

        const resendData = await resendRes.json();

        if (!resendRes.ok) {
          if (!firstError) firstError = resendData?.message || "Review request failed to send.";
          failedEmails.push(...emails);
          await logEmailEvent(supabase, {
            inspectionId,
            recipient: emailsCsv,
            subject,
            status: "failed",
            metadata: {
              type: "review_request",
              recipient_type: type,
              error: resendData?.message || "Review request failed to send.",
              resendData,
            },
          });
          continue;
        }

        sentEmails.push(...emails);
        if (type === "client") sentClient = true;

        await logEmailEvent(supabase, {
          inspectionId,
          recipient: emailsCsv,
          subject,
          status: "sent",
          resendId: resendData?.id || null,
          html,
          metadata: {
            type: "review_request",
            recipient_type: type,
            googleReviewUrl,
          },
        });

        await logAuditEvent(supabase, {
          userId: user.id,
          inspectionId,
          recipient: emailsCsv,
        });
      } catch (error: any) {
        if (!firstError) firstError = error?.message || "Review request failed to send.";
        failedEmails.push(...emails);
      }
    }

    if (sentEmails.length === 0) {
      return NextResponse.json(
        { error: firstError || "Review request failed to send." },
        { status: 500 }
      );
    }

    // review_status tracks the CLIENT review request; only set it when a buyer
    // was actually asked (not for an agent-only send).
    if (sentClient) {
      await supabase
        .from("inspections")
        .update({ review_status: "Requested" })
        .eq("id", inspectionId)
        .eq(accessFilter.column, accessFilter.value);
    }

    const sentCsv = sentEmails.join(", ");

    await sendOwnerPushNotification({
      title: "Review Request Sent",
      body: `Review request sent to ${sentEmails.length} recipient${sentEmails.length === 1 ? "" : "s"} (${sentCsv}) for ${getPropertyLabel(
        inspection
      )}.`,
      url: `/reports/${inspectionId}`,
      eventType: "review_request_sent",
      metadata: {
        inspection_id: inspectionId,
        recipient: sentCsv,
        property: getPropertyLabel(inspection),
      },
    });

    const failNote = failedEmails.length ? ` (${failedEmails.length} failed)` : "";

    return NextResponse.json({
      success: true,
      sent: sentEmails,
      failed: failedEmails,
      message: `Review request sent to ${sentEmails.length} recipient${sentEmails.length === 1 ? "" : "s"} (${sentCsv})${failNote}.`,
    });
  } catch (error: any) {
    console.error("Send review request error:", error);

    return NextResponse.json(
      { error: error?.message || "Review request failed to send." },
      { status: 500 }
    );
  }
}
