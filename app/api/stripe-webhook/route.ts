import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";
import http2 from "http2";
import { formatUsd } from "../../../lib/currency";
import { getCompanyBrandingById, buildBrandedFromHeader, type CompanyBranding } from "../../../lib/companyBranding";
import { OWNER_EMAILS } from "../../../lib/ownerEmails";
import { sendPushNotification } from "../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(key, {
  });
}

function getResend() {
  const key = process.env.RESEND_API_KEY;

  if (!key) return null;

  return new Resend(key);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function logStripeEvent(
  supabase: any,
  {
    inspectionId,
    paymentIntentId,
    amount,
    status,
    metadata = {},
  }: {
    inspectionId: any;
    paymentIntentId?: string | null;
    amount?: number | null;
    status: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    await supabase.from("stripe_logs").insert({
      inspection_id: Number(inspectionId),
      payment_intent_id: paymentIntentId || null,
      amount: amount ?? null,
      status,
      metadata,
    });
  } catch (error) {
    console.error("Stripe log insert failed:", error);
  }
}

async function logAuditEvent(
  supabase: any,
  {
    action,
    resourceType,
    resourceId,
    metadata = {},
  }: {
    action: string;
    resourceType: string;
    resourceId: any;
    metadata?: Record<string, any>;
  }
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: null,
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      metadata,
    });
  } catch (error) {
    console.error("Audit log insert failed:", error);
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
    metadata = {},
  }: {
    inspectionId: any;
    recipient: string;
    subject: string;
    status: "sent" | "failed" | "skipped";
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
      email_type: "payment_receipt",
      subject,
      message: status === "sent" ? `Receipt sent to ${recipient}.` : metadata?.error || "Receipt send failed.",
      status,
      resend_id: resendId || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata,
    });
  } catch (error) {
    console.error("Email log insert failed:", error);
  }
}

const money = formatUsd;

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getApnsPrivateKey() {
  const key = process.env.APPLE_APNS_PRIVATE_KEY || "";
  return key.replace(/\\n/g, "\n").trim();
}

function createApnsJwt() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const privateKey = getApnsPrivateKey();

  if (!teamId || !keyId || !privateKey) {
    throw new Error(
      "Missing Apple APNs credentials. Set APPLE_TEAM_ID, APPLE_APNS_KEY_ID, and APPLE_APNS_PRIVATE_KEY."
    );
  }

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64Url(signature)}`;
}

function getApnsHost() {
  const useSandbox = String(process.env.APPLE_APNS_USE_SANDBOX || "")
    .toLowerCase()
    .trim();

  return useSandbox === "true" || useSandbox === "1"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

function getApnsTopic() {
  const topic = process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID;

  if (!topic) {
    throw new Error("Missing APPLE_BUNDLE_ID for APNs topic.");
  }

  return topic;
}

async function sendNativeApns(
  token: string,
  payload: { title: string; body: string; url: string; eventType: string }
) {
  const jwt = createApnsJwt();
  const topic = getApnsTopic();
  const host = getApnsHost();

  const apnsPayload = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
    url: payload.url,
    eventType: payload.eventType,
  });

  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const client = http2.connect(host);

    const cleanup = () => {
      try {
        client.close();
      } catch {}
    };

    client.on("error", (error) => {
      cleanup();
      reject(error);
    });

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let responseBody = "";
    let status = 0;

    request.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      responseBody += chunk;
    });

    request.on("end", () => {
      cleanup();

      if (status >= 200 && status < 300) {
        resolve({ status, body: responseBody });
        return;
      }

      const error: any = new Error(responseBody || `APNs send failed with status ${status}.`);
      error.statusCode = status;
      error.body = responseBody;
      reject(error);
    });

    request.on("error", (error) => {
      cleanup();
      reject(error);
    });

    request.write(apnsPayload);
    request.end();
  });
}

function shouldDisableNativeToken(error: any) {
  const statusCode = Number(error?.statusCode || 0);
  const body = String(error?.body || error?.message || "");

  return (
    (statusCode === 400 && body.includes("BadDeviceToken")) ||
    statusCode === 410 ||
    body.includes("Unregistered")
  );
}

async function sendOwnerPushNotification(
  supabase: any,
  {
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
  }
) {
  try {
    const payload = { title, body, url, eventType };
    let webSent = 0;
    let nativeSent = 0;
    let failed = 0;

    const { data: webSubscriptions, error: webError } = await supabase
      .from("app_push_subscriptions")
      .select("*")
      .eq("enabled", true)
      .in("user_email", OWNER_EMAILS);

    if (webError) {
      console.error("Owner web push subscription load error:", webError);
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

    if (publicKey && privateKey) {
      const webpush = await import("web-push");
      webpush.default.setVapidDetails(subject, publicKey, privateKey);

      for (const row of webSubscriptions || []) {
        try {
          await webpush.default.sendNotification(row.subscription, JSON.stringify(payload));
          webSent += 1;
        } catch (error: any) {
          failed += 1;
          console.error("Owner web push send error:", error);

          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await supabase
              .from("app_push_subscriptions")
              .update({ enabled: false, updated_at: new Date().toISOString() })
              .eq("endpoint", row.endpoint);
          }
        }
      }
    } else {
      console.warn("Owner web push skipped: missing VAPID keys.");
    }

    const { data: nativeTokens, error: nativeError } = await supabase
      .from("app_native_push_tokens")
      .select("*")
      .eq("enabled", true)
      .in("user_email", OWNER_EMAILS);

    if (nativeError) {
      console.error("Owner native push token load error:", nativeError);
    }

    for (const row of nativeTokens || []) {
      try {
        await sendNativeApns(row.token, payload);
        nativeSent += 1;
      } catch (error: any) {
        failed += 1;
        console.error("Owner native push send error:", error);

        if (shouldDisableNativeToken(error)) {
          await supabase
            .from("app_native_push_tokens")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("token", row.token);
        }
      }
    }

    await supabase.from("app_notification_logs").insert({
      title,
      body,
      event_type: eventType,
      target_url: url,
      sent_count: webSent + nativeSent,
      failed_count: failed,
      metadata: {
        ...metadata,
        target: "owner",
        owner_emails: OWNER_EMAILS,
        web_sent: webSent,
        native_sent: nativeSent,
      },
    });
  } catch (error) {
    console.error("Owner push notification error:", error);
  }
}

function getClientEmail(inspection: any, session: Stripe.Checkout.Session) {
  const email =
    inspection?.client_email ||
    session.customer_details?.email ||
    session.customer_email ||
    "";

  if (!email || !String(email).includes("@")) return "";

  return String(email);
}

function buildReceiptHtml({
  inspection,
  amountPaid,
  balanceDue,
  paidAt,
  sessionId,
  portalProcessingFee,
  totalCharged,
  branding,
}: {
  inspection: any;
  amountPaid: number;
  balanceDue: number;
  paidAt: string;
  sessionId: string;
  portalProcessingFee: number;
  totalCharged: number;
  branding: CompanyBranding;
}) {
  const property =
    inspection?.property_address ||
    inspection?.address ||
    "Inspection Property";

  const client = inspection?.client_name || "Client";

  return `
    <div style="margin:0;padding:0;background:#020617;font-family:Arial,sans-serif;color:#ffffff;">
      <div style="max-width:680px;margin:0 auto;padding:28px;">
        <div style="border:1px solid #1e293b;background:#0f172a;border-radius:20px;overflow:hidden;">
          <div style="background:#071224;padding:28px;border-bottom:1px solid #1e293b;">
            <p style="margin:0;color:#2dd4bf;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
              ${branding.name}
            </p>
            <h1 style="margin:12px 0 0;color:#ffffff;font-size:30px;line-height:1.2;">
              Payment Received
            </h1>
            <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">
              Thank you. Your inspection payment has been successfully received.
            </p>
          </div>

          <div style="padding:28px;">
            <p style="margin:0 0 16px;color:#e2e8f0;font-size:16px;">
              Hi ${client},
            </p>

            <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.7;">
              This confirms your payment for the inspection at:
            </p>

            <div style="border:1px solid #334155;background:#020617;border-radius:14px;padding:18px;margin-bottom:22px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                Property
              </p>
              <p style="margin:7px 0 0;color:#ffffff;font-size:18px;font-weight:800;">
                ${property}
              </p>
            </div>

            <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:22px;">
              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Inspection Balance Paid
                </p>
                <p style="margin:7px 0 0;color:#4ade80;font-size:28px;font-weight:900;">
                  ${money(amountPaid)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Online Payment Fee
                </p>
                <p style="margin:7px 0 0;color:#facc15;font-size:28px;font-weight:900;">
                  ${money(portalProcessingFee)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Total Charged Online
                </p>
                <p style="margin:7px 0 0;color:#4ade80;font-size:28px;font-weight:900;">
                  ${money(totalCharged)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Balance Due
                </p>
                <p style="margin:7px 0 0;color:#2dd4bf;font-size:28px;font-weight:900;">
                  ${money(balanceDue)}
                </p>
              </div>
            </div>

            <div style="border-top:1px solid #334155;padding-top:18px;color:#94a3b8;font-size:13px;line-height:1.7;">
              <p style="margin:0;"><strong>Paid At:</strong> ${paidAt}</p>
              <p style="margin:4px 0 0;"><strong>Receipt / Session:</strong> ${sessionId}</p>
            </div>

            <p style="margin:24px 0 0;color:#cbd5e1;font-size:14px;line-height:1.7;">
              If your agreement is signed and the inspection report has been published, your report will be available in the client portal.
            </p>
          </div>
        </div>

        <p style="text-align:center;margin:18px 0 0;color:#64748b;font-size:12px;">
          ${[branding.name, branding.website || branding.email].filter(Boolean).join(" • ")}
        </p>
      </div>
    </div>
  `;
}

async function sendReceiptEmail({
  supabase,
  inspection,
  session,
  amountPaid,
  balanceDue,
  paidAt,
  portalProcessingFee,
  totalCharged,
}: {
  supabase: any;
  inspection: any;
  session: Stripe.Checkout.Session;
  amountPaid: number;
  balanceDue: number;
  paidAt: string;
  portalProcessingFee: number;
  totalCharged: number;
}) {
  const resend = getResend();

  if (!resend) {
    console.warn("Receipt email skipped: RESEND_API_KEY is missing.");

    await logEmailEvent(supabase, {
      inspectionId: inspection?.id || session.metadata?.inspection_id,
      recipient: "",
      subject: "Payment Received",
      status: "skipped",
      metadata: {
        reason: "RESEND_API_KEY is missing",
        sessionId: session.id,
      },
    });

    return;
  }

  const to = getClientEmail(inspection, session);

  if (!to) {
    console.warn("Receipt email skipped: no valid client email.");

    await logEmailEvent(supabase, {
      inspectionId: inspection?.id || session.metadata?.inspection_id,
      recipient: "",
      subject: "Payment Received",
      status: "skipped",
      metadata: {
        reason: "No valid client email",
        sessionId: session.id,
      },
    });

    return;
  }

  const property = inspection?.property_address || inspection?.address || "Inspection";

  const branding = await getCompanyBrandingById(inspection?.company_id);

  const from = buildBrandedFromHeader(
    branding,
    "On Point Home Inspections <agreements@onpointhomeinspect.com>"
  );

  const html = buildReceiptHtml({
    inspection,
    amountPaid,
    balanceDue,
    paidAt,
    sessionId: session.id,
    portalProcessingFee,
    totalCharged,
    branding,
  });

  const subject = `Payment Received - ${property}`;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Receipt email send error:", error);

    await logEmailEvent(supabase, {
      inspectionId: inspection?.id || session.metadata?.inspection_id,
      recipient: to,
      subject,
      status: "failed",
      metadata: {
        type: "stripe_payment_receipt",
        sessionId: session.id,
        error,
      },
    });

    return;
  }

  await logEmailEvent(supabase, {
    inspectionId: inspection?.id || session.metadata?.inspection_id,
    recipient: to,
    subject,
    status: "sent",
    resendId: data?.id || null,
    metadata: {
      type: "stripe_payment_receipt",
      sessionId: session.id,
      amountPaid,
      portalProcessingFee,
      totalCharged,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();

    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error: any) {
    console.error("Stripe webhook signature error:", error.message);

    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const supabase = getSupabaseAdmin();

      if (session.mode === "subscription") {
        const profileId = session.metadata?.profile_id || session.metadata?.user_id;
        const userId = session.metadata?.user_id || profileId;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id || null;
        const customerEmail =
          session.customer_details?.email || session.customer_email || session.metadata?.email || "Inspector";
        const amount = session.amount_total ? session.amount_total / 100 : 0;

        if (profileId) {
          await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
              updated_at: new Date().toISOString(),
            })
            .eq("id", profileId);
        } else if (customerId) {
          await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);
        }

        await logAuditEvent(supabase, {
          action: "subscription_checkout_completed",
          resourceType: "profile",
          resourceId: profileId || userId || customerId || session.id,
          metadata: {
            session_id: session.id,
            subscription_id: subscriptionId,
            customer_id: customerId,
            customer_email: customerEmail,
            amount,
            event_id: event.id,
          },
        });

        await sendOwnerPushNotification(supabase, {
          title: "🎉 New Subscription",
          body: `${customerEmail} started an FLOW subscription${amount ? ` for ${money(amount)}/month` : ""}.`,
          url: "/dashboard/owner/revenue",
          eventType: "subscription_created",
          metadata: {
            session_id: session.id,
            subscription_id: subscriptionId,
            customer_id: customerId,
            customer_email: customerEmail,
            profile_id: profileId || null,
            user_id: userId || null,
            amount,
          },
        });
      } else {
      const inspectionId =
                session.metadata?.inspection_id || session.client_reference_id;
        
              if (!inspectionId) {
                return NextResponse.json(
                  { error: "Missing inspection ID on Stripe session." },
                  { status: 400 }
                );
              }
        
              const totalCharged = session.amount_total ? session.amount_total / 100 : 0;
        
              const portalProcessingFee = Number(
                session.metadata?.portal_processing_fee || 0
              );
        
              const amountPaid =
                Number(session.metadata?.invoice_balance_due || 0) ||
                Math.max(0, totalCharged - portalProcessingFee);
        
              const paidAt = new Date().toISOString();
              const supabase = getSupabaseAdmin();
        
              const { data: existingInspection } = await supabase
                .from("inspections")
                .select("*")
                .eq("id", inspectionId)
                .single();

              const priorPaid =
                Number(
                  String(existingInspection?.amount_paid ?? "").replace(/[^0-9.-]/g, "")
                ) || 0;
              const invoiceAmountForPay =
                Number(
                  String(
                    existingInspection?.invoice_amount ??
                      existingInspection?.total_price ??
                      existingInspection?.total ??
                      existingInspection?.price ??
                      ""
                  ).replace(/[^0-9.-]/g, "")
                ) || 0;
              // Marking Paid means the full invoice is now collected. Record the
              // invoice total (idempotent, and preserves any earlier offline
              // partial payment) instead of overwriting amount_paid with only
              // the amount charged online (audit finding H9).
              const paidTotal =
                invoiceAmountForPay > 0
                  ? invoiceAmountForPay
                  : priorPaid + amountPaid;

              const { error } = await supabase
                .from("inspections")
                .update({
                  payment_status: "Paid",
                  invoice_status: "Paid",
                  amount_paid: paidTotal,
                  balance_due: 0,
                  payment_method: "Stripe",
                  payment_notes: `Stripe payment completed. Inspection balance paid: ${money(
                    amountPaid
                  )}. Online payment fee: ${money(
                    portalProcessingFee
                  )}. Total charged online: ${money(totalCharged)}. Session: ${session.id}`,
                  invoice_notes: `Stripe payment completed. Inspection balance paid: ${money(
                    amountPaid
                  )}. Online payment fee: ${money(
                    portalProcessingFee
                  )}. Total charged online: ${money(totalCharged)}. Session: ${session.id}`,
                  stripe_payment_intent_id:
                    typeof session.payment_intent === "string" ? session.payment_intent : null,
                  stripe_checkout_session_id: session.id,
                  paid_at: paidAt,
                })
                .eq("id", inspectionId);
        
              if (error) {
                console.error("Supabase payment update error:", error);
        
                return NextResponse.json(
                  { error: "Failed to update inspection payment." },
                  { status: 500 }
                );
              }
        
              await logStripeEvent(supabase, {
                inspectionId,
                paymentIntentId:
                  typeof session.payment_intent === "string" ? session.payment_intent : null,
                amount: totalCharged,
                status: "payment_completed",
                metadata: {
                  sessionId: session.id,
                  eventId: event.id,
                  amountPaid,
                  portalProcessingFee,
                  totalCharged,
                  paidAt,
                },
              });
        
              await logAuditEvent(supabase, {
                action: "stripe_payment_completed",
                resourceType: "inspection",
                resourceId: inspectionId,
                metadata: {
                  sessionId: session.id,
                  eventId: event.id,
                  amountPaid,
                  portalProcessingFee,
                  totalCharged,
                  paidAt,
                },
              });
        
              await supabase.from("inspection_view_events").insert({
                inspection_id_bigint: Number(inspectionId),
                view_type: "payment_received",
                viewer_role: "system",
                viewer_email: null,
                path: "/payment",
                metadata: {
                  source: "stripe_webhook",
                  amount_paid: amountPaid,
                  total_charged: totalCharged,
                  portal_processing_fee: portalProcessingFee,
                  session_id: session.id,
                  paid_at: paidAt,
                },
              });
        
              // Money here goes to the inspecting company, not to FLOW - this
              // should notify that company's inspector, not the platform
              // owner (unlike the subscription-billing pushes elsewhere in
              // this file, which are genuinely about payments made to FLOW).
              if (existingInspection?.inspector_id) {
                await sendPushNotification({
                  title: "Payment Received",
                  body: `${money(totalCharged)} received for ${getPropertyLabel(
                    existingInspection
                  )}.`,
                  url: `/reports/${inspectionId}`,
                  eventType: "payment_received",
                  target: "user",
                  targetUserId: existingInspection.inspector_id,
                });
              }
        
              if (existingInspection) {
                await sendReceiptEmail({
                  supabase,
                  inspection: existingInspection,
                  session,
                  amountPaid,
                  balanceDue: 0,
                  paidAt,
                  portalProcessingFee,
                  totalCharged,
                });
              }
        
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const supabase = getSupabaseAdmin();

      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id || null;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
      const customerEmail = invoice.customer_email || "Inspector";
      const amountPaid = Number(invoice.amount_paid || 0) / 100;

      if (customerId) {
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      }

      await logAuditEvent(supabase, {
        action: "subscription_payment_received",
        resourceType: "stripe_invoice",
        resourceId: invoice.id,
        metadata: {
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
          customer_id: customerId,
          customer_email: customerEmail,
          amount_paid: amountPaid,
          event_id: event.id,
        },
      });

      await sendOwnerPushNotification(supabase, {
        title: "💰 Subscription Payment",
        body: `${money(amountPaid)} subscription payment received${customerEmail ? ` from ${customerEmail}` : ""}.`,
        url: "/dashboard/owner/revenue",
        eventType: "subscription_payment_received",
        metadata: {
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
          customer_id: customerId,
          customer_email: customerEmail,
          amount_paid: amountPaid,
        },
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const supabase = getSupabaseAdmin();

      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id || null;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
      const customerEmail = invoice.customer_email || "Inspector";

      if (customerId) {
        await supabase
          .from("profiles")
          .update({
            subscription_status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      }

      await logAuditEvent(supabase, {
        action: "subscription_payment_failed",
        resourceType: "stripe_invoice",
        resourceId: invoice.id,
        metadata: {
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
          customer_id: customerId,
          customer_email: customerEmail,
          event_id: event.id,
        },
      });

      await sendOwnerPushNotification(supabase, {
        title: "⚠️ Subscription Payment Failed",
        body: `A subscription payment failed${customerEmail ? ` for ${customerEmail}` : ""}.`,
        url: "/dashboard/owner/revenue",
        eventType: "subscription_payment_failed",
        metadata: {
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
          customer_id: customerId,
          customer_email: customerEmail,
        },
      });
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const supabase = getSupabaseAdmin();

      const subscriptionId = subscription.id || null;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id || null;

      const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
      const subscriptionPeriodEnd = subscription.items.data[0]?.current_period_end;
      const currentPeriodEnd = subscriptionPeriodEnd
        ? new Date(subscriptionPeriodEnd * 1000).toISOString()
        : null;

      const stripeStatus = String(subscription.status || "inactive").toLowerCase();

      if (subscriptionId || customerId) {
        const updatePayload = {
          stripe_subscription_id: subscriptionId,
          subscription_status: stripeStatus,
          subscription_cancel_at_period_end: cancelAtPeriodEnd,
          subscription_current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        };

        if (subscriptionId) {
          await supabase
            .from("profiles")
            .update(updatePayload)
            .eq("stripe_subscription_id", subscriptionId);
        }

        if (customerId) {
          await supabase
            .from("profiles")
            .update(updatePayload)
            .eq("stripe_customer_id", customerId);
        }
      }

      await logAuditEvent(supabase, {
        action: cancelAtPeriodEnd
          ? "subscription_cancel_at_period_end"
          : "subscription_updated",
        resourceType: "stripe_subscription",
        resourceId: subscriptionId || customerId || "unknown",
        metadata: {
          subscription_id: subscriptionId,
          customer_id: customerId,
          status: stripeStatus,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: currentPeriodEnd,
          event_id: event.id,
        },
      });

      if (cancelAtPeriodEnd) {
        await sendOwnerPushNotification(supabase, {
          title: "⚠️ Subscription Set To Cancel",
          body: "An inspector scheduled their subscription to cancel at the end of the billing period.",
          url: "/dashboard/owner/revenue",
          eventType: "subscription_cancel_at_period_end",
          metadata: {
            subscription_id: subscriptionId,
            customer_id: customerId,
            current_period_end: currentPeriodEnd,
          },
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const supabase = getSupabaseAdmin();

      const subscriptionId = subscription.id || null;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;

      if (customerId) {
        await supabase
          .from("profiles")
          .update({
            subscription_status: "canceled",
            subscription_cancel_at_period_end: false,
            subscription_current_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      }

      await logAuditEvent(supabase, {
        action: "subscription_cancelled",
        resourceType: "stripe_subscription",
        resourceId: subscriptionId || customerId || "unknown",
        metadata: {
          subscription_id: subscriptionId,
          customer_id: customerId,
          event_id: event.id,
        },
      });

      await sendOwnerPushNotification(supabase, {
        title: "❌ Subscription Canceled",
        body: "An inspector subscription was canceled.",
        url: "/dashboard/owner/revenue",
        eventType: "subscription_cancelled",
        metadata: {
          subscription_id: subscriptionId,
          customer_id: customerId,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook handler error:", error);

    return NextResponse.json(
      { error: error?.message || "Webhook handler failed." },
      { status: 500 }
    );
  }
}
