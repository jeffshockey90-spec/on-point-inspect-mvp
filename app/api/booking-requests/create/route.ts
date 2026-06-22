import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";
import http2 from "http2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = [
  "jeff@onpointhomeinspect.com",
];

type PushPayload = {
  title: string;
  body: string;
  url: string;
  eventType: string;
};

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

function cleanText(value: any) {
  return String(value || "").trim();
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanServices(body: any) {
  const raw = Array.isArray(body.services_requested)
    ? body.services_requested
    : cleanText(body.service_type)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const unique = Array.from(
    new Set(raw.map((item: any) => cleanText(item)).filter(Boolean))
  );

  return unique.length ? unique : ["Buyer Home Inspection"];
}

function cleanTime(value: any, fallback: string) {
  const text = cleanText(value || fallback);
  if (text.toLowerCase().includes("flexible")) return "10:00";
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);
  return fallback;
}

function formatTime(value: any) {
  const clean = cleanText(value);
  if (!clean) return "";

  const [hoursRaw, minutesRaw] = clean.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number((minutesRaw || "00").slice(0, 2));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return clean;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: any) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return cleanText(value);

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBaseUrl(request: Request) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function buildAlertPayload(booking: any, request: Request): PushPayload {
  const services = Array.isArray(booking.services_requested)
    ? booking.services_requested.join(", ")
    : booking.service_type || "Inspection";

  const address = [booking.property_address, booking.city, booking.state, booking.zip]
    .filter(Boolean)
    .join(", ");

  const when = `${formatDate(booking.preferred_date)} at ${formatTime(
    booking.preferred_time
  )}`.trim();

  return {
    title: "New Booking Request",
    body: `${booking.client_name || "Client"} requested ${services}${
      address ? ` at ${address}` : ""
    }${when ? ` for ${when}` : ""}.`,
    url: `/schedule?bookingRequestId=${booking.id}`,
    eventType: "booking_request_created",
  };
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
  if (!topic) throw new Error("Missing APPLE_BUNDLE_ID for APNs topic.");
  return topic;
}

async function sendNativeApns(token: string, payload: PushPayload) {
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

    const req = client.request({
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

    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });

    req.on("end", () => {
      cleanup();

      if (status >= 200 && status < 300) {
        resolve({ status, body: responseBody });
        return;
      }

      const error: any = new Error(
        responseBody || `APNs send failed with status ${status}.`
      );
      error.statusCode = status;
      error.body = responseBody;
      reject(error);
    });

    req.on("error", (error) => {
      cleanup();
      reject(error);
    });

    req.write(apnsPayload);
    req.end();
  });
}

async function sendWebPush(subscription: any, payload: PushPayload) {
  const webpush = await import("web-push");

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }

  webpush.default.setVapidDetails(subject, publicKey, privateKey);
  return webpush.default.sendNotification(subscription, JSON.stringify(payload));
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

function isExpiredWebPush(error: any) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode === 404 || statusCode === 410;
}

async function getOwnerIds(admin: any) {
  const ids = new Set<string>();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,user_id,email,user_email")
    .in("email", OWNER_EMAILS);

  for (const row of profiles || []) {
    [row.id, row.user_id].filter(Boolean).forEach((value: any) => ids.add(String(value)));
  }

  return ids;
}

async function sendOwnerPush(admin: any, payload: PushPayload) {
  const ownerEmails = new Set(OWNER_EMAILS.map((email) => email.toLowerCase()));
  const ownerIds = await getOwnerIds(admin);

  const { data: webRows } = await admin
    .from("app_push_subscriptions")
    .select("*")
    .eq("enabled", true);

  const { data: nativeRows } = await admin
    .from("app_native_push_tokens")
    .select("*")
    .eq("enabled", true);

  const matchesOwner = (row: any) => {
    const email = String(row?.user_email || row?.email || "").toLowerCase();
    const userId = String(row?.user_id || row?.auth_user_id || "");
    return Boolean((email && ownerEmails.has(email)) || (userId && ownerIds.has(userId)));
  };

  const webTargets = (webRows || []).filter(matchesOwner);
  const nativeTargets = (nativeRows || []).filter(matchesOwner);

  let sent = 0;
  let failed = 0;

  for (const device of webTargets) {
    try {
      await sendWebPush(device.subscription, payload);
      sent += 1;
    } catch (error: any) {
      failed += 1;
      console.error("Booking web push failed:", error);

      if (isExpiredWebPush(error)) {
        await admin
          .from("app_push_subscriptions")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("endpoint", device.endpoint);
      }
    }
  }

  for (const device of nativeTargets) {
    try {
      await sendNativeApns(device.token, payload);
      sent += 1;
    } catch (error: any) {
      failed += 1;
      console.error("Booking native push failed:", error);

      if (shouldDisableNativeToken(error)) {
        await admin
          .from("app_native_push_tokens")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("token", device.token);
      }
    }
  }

  return {
    sent,
    failed,
    webTargets: webTargets.length,
    nativeTargets: nativeTargets.length,
  };
}

function buildEmailHtml(booking: any, request: Request) {
  const scheduleUrl = `${getBaseUrl(request)}/schedule?bookingRequestId=${booking.id}`;
  const services = Array.isArray(booking.services_requested)
    ? booking.services_requested.join(", ")
    : booking.service_type || "Inspection";
  const address = [booking.property_address, booking.city, booking.state, booking.zip]
    .filter(Boolean)
    .join(", ");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px;color:#0f766e">New Booking Request</h2>
      <p>A new inspection request was submitted through On Point Inspect.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px">
        <tr><td><strong>Client</strong></td><td>${booking.client_name || ""}</td></tr>
        <tr><td><strong>Client Phone</strong></td><td>${booking.client_phone || ""}</td></tr>
        <tr><td><strong>Client Email</strong></td><td>${booking.client_email || ""}</td></tr>
        <tr><td><strong>Realtor</strong></td><td>${booking.realtor_name || ""}</td></tr>
        <tr><td><strong>Realtor Phone</strong></td><td>${booking.realtor_phone || ""}</td></tr>
        <tr><td><strong>Realtor Email</strong></td><td>${booking.realtor_email || ""}</td></tr>
        <tr><td><strong>Property</strong></td><td>${address}</td></tr>
        <tr><td><strong>Square Feet</strong></td><td>${booking.square_feet || ""}</td></tr>
        <tr><td><strong>Services</strong></td><td>${services}</td></tr>
        <tr><td><strong>Preferred Time</strong></td><td>${formatDate(booking.preferred_date)} at ${formatTime(booking.preferred_time)}</td></tr>
        <tr><td><strong>Alternate Time</strong></td><td>${booking.alternate_date ? `${formatDate(booking.alternate_date)} at ${formatTime(booking.alternate_time)}` : ""}</td></tr>
        <tr><td><strong>Notes</strong></td><td>${booking.notes || ""}</td></tr>
      </table>
      <p style="margin-top:18px">
        <a href="${scheduleUrl}" style="display:inline-block;background:#14b8a6;color:#020617;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:10px">Open Schedule</a>
      </p>
    </div>
  `;
}

async function sendOwnerEmail(booking: any, request: Request) {
  const to = (process.env.BOOKING_ALERT_EMAILS || OWNER_EMAILS.join(","))
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (to.length === 0) {
    return { sent: 0, skipped: true, reason: "No alert email recipients configured." };
  }

  const subject = `New Booking Request - ${booking.client_name || "Inspection"}`;
  const html = buildEmailHtml(booking, request);

  try {
    const nodemailer = eval("require")("nodemailer");

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || user;

    if (!host || !user || !pass || !from) {
      return {
        sent: 0,
        skipped: true,
        reason: "SMTP email env vars are missing.",
      };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: `New Booking Request\n\nClient: ${booking.client_name || ""}\nClient Phone: ${booking.client_phone || ""}\nClient Email: ${booking.client_email || ""}\nRealtor: ${booking.realtor_name || ""}\nRealtor Phone: ${booking.realtor_phone || ""}\nRealtor Email: ${booking.realtor_email || ""}\nProperty: ${[booking.property_address, booking.city, booking.state, booking.zip].filter(Boolean).join(", ")}\nServices: ${Array.isArray(booking.services_requested) ? booking.services_requested.join(", ") : booking.service_type || ""}\nPreferred: ${formatDate(booking.preferred_date)} at ${formatTime(booking.preferred_time)}\n\nOpen schedule: ${getBaseUrl(request)}/schedule?bookingRequestId=${booking.id}`,
    });

    return { sent: to.length, skipped: false };
  } catch (error: any) {
    console.error("Booking email failed:", error);
    return {
      sent: 0,
      skipped: false,
      error: error?.message || "Booking alert email failed.",
    };
  }
}

async function notifyOwner(admin: any, booking: any, request: Request) {
  const payload = buildAlertPayload(booking, request);

  const [push, email] = await Promise.all([
    sendOwnerPush(admin, payload).catch((error: any) => ({
      sent: 0,
      failed: 1,
      error: error?.message || "Owner push failed.",
    })),
    sendOwnerEmail(booking, request).catch((error: any) => ({
      sent: 0,
      error: error?.message || "Owner email failed.",
    })),
  ]);

  return { push, email };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const requesterName = cleanText(body.requester_name);
    const requesterEmail = cleanText(body.requester_email).toLowerCase();
    const requesterPhone = cleanText(body.requester_phone);
    const realtorName = cleanText(body.realtor_name) || (cleanText(body.requester_role).toLowerCase().includes("realtor") ? requesterName : "");
    const realtorEmail = (cleanText(body.realtor_email) || (cleanText(body.requester_role).toLowerCase().includes("realtor") ? requesterEmail : "")).toLowerCase();
    const realtorPhone = cleanText(body.realtor_phone) || (cleanText(body.requester_role).toLowerCase().includes("realtor") ? requesterPhone : "");
    const clientName = cleanText(body.client_name);
    const clientEmail = cleanText(body.client_email).toLowerCase();
    const clientPhone = cleanText(body.client_phone);
    const propertyAddress = cleanText(body.property_address);
    const city = cleanText(body.city);
    const state = cleanText(body.state).toUpperCase();
    const preferredDate = cleanText(body.preferred_date);
    const preferredTime = cleanTime(body.preferred_time, "10:00");
    const services = cleanServices(body);
    const serviceType = services.join(", ");

    if (!clientName || !clientPhone || !propertyAddress || !city || !state || !preferredDate) {
      return NextResponse.json(
        { error: "Please complete the required client, property, and appointment fields." },
        { status: 400 }
      );
    }

    if (!validEmail(requesterEmail) || !validEmail(clientEmail) || !validEmail(realtorEmail)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("booking_requests")
      .insert({
        status: "pending",
        requester_name: requesterName || clientName,
        requester_email: requesterEmail || clientEmail || realtorEmail,
        requester_phone: requesterPhone || clientPhone || realtorPhone,
        requester_role: cleanText(body.requester_role || (realtorName || realtorEmail || realtorPhone ? "Realtor" : "Client")),
        realtor_name: realtorName,
        realtor_email: realtorEmail,
        realtor_phone: realtorPhone,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        property_address: propertyAddress,
        city,
        state,
        zip: cleanText(body.zip),
        square_feet: cleanText(body.square_feet),
        service_type: serviceType,
        services_requested: services,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        alternate_date: cleanText(body.alternate_date) || null,
        alternate_time: body.alternate_time ? cleanTime(body.alternate_time, "14:00") : null,
        notes: cleanText(body.notes),
        source: "public_booking_page",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notifications = await notifyOwner(admin, data, request);

    return NextResponse.json({ ok: true, request: data, notifications });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Booking request failed." }, { status: 500 });
  }
}
