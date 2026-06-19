import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";
import http2 from "http2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  eventType: string;
};

type InspectionRow = Record<string, any>;

type ReminderKind = "24h" | "2h";

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

  const header = {
    alg: "ES256",
    kid: keyId,
  };

  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
  };

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
  const topic =
    process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID;

  if (!topic) {
    throw new Error("Missing APPLE_BUNDLE_ID for APNs topic.");
  }

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

  return await new Promise<{ status: number; body: string }>(
    (resolve, reject) => {
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

        const error: any = new Error(
          responseBody || `APNs send failed with status ${status}.`
        );
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
    }
  );
}

async function sendWebPush(subscription: any, payload: PushPayload) {
  const webpush = await import("web-push");

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    );
  }

  webpush.default.setVapidDetails(subject, publicKey, privateKey);

  return webpush.default.sendNotification(
    subscription,
    JSON.stringify(payload)
  );
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

function getInspectionDate(row: InspectionRow) {
  return (
    row.inspection_date ||
    row.scheduled_date ||
    row.date ||
    row.start_date ||
    null
  );
}

function getInspectionTime(row: InspectionRow) {
  return (
    row.inspection_time ||
    row.scheduled_time ||
    row.time ||
    row.start_time ||
    "09:00"
  );
}

function cleanDate(value: any) {
  if (!value) return "";

  const text = String(value).trim();

  if (text.includes("T")) {
    return text.split("T")[0];
  }

  return text;
}

function cleanTime(value: any) {
  if (!value) return "09:00";

  const text = String(value).trim();

  if (text.includes("T")) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return date.toTimeString().slice(0, 5);
    }
  }

  if (/^\d{1,2}:\d{2}/.test(text)) {
    return text.slice(0, 5);
  }

  return "09:00";
}

function getInspectionStart(row: InspectionRow) {
  const date = cleanDate(getInspectionDate(row));
  const time = cleanTime(getInspectionTime(row));

  if (!date) return null;

  const start = new Date(`${date}T${time}:00`);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return start;
}

function getAddress(row: InspectionRow) {
  const parts = [
    row.address || row.property_address || row.street || row.location,
    row.city,
    row.state,
    row.zip || row.zip_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "inspection";
}

function getClient(row: InspectionRow) {
  return (
    row.client_name ||
    row.client ||
    row.buyer_name ||
    row.customer_name ||
    row.customer ||
    ""
  );
}

function getStatus(row: InspectionRow) {
  return String(row.status || row.inspection_status || "").toLowerCase();
}

function isCancelledOrComplete(row: InspectionRow) {
  const status = getStatus(row);

  return (
    status.includes("cancel") ||
    status.includes("complete") ||
    status.includes("done")
  );
}

function getInspectionOwnerIds(row: InspectionRow) {
  return [
    row.user_id,
    row.owner_id,
    row.inspector_id,
    row.created_by,
    row.auth_user_id,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function getInspectionEmails(row: InspectionRow) {
  return [
    row.user_email,
    row.owner_email,
    row.inspector_email,
    row.email,
    row.inspector,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function inReminderWindow(
  inspectionStart: Date,
  now: Date,
  kind: ReminderKind
) {
  const targetMs =
    kind === "24h"
      ? 24 * 60 * 60 * 1000
      : 2 * 60 * 60 * 1000;

  const reminderTime = new Date(inspectionStart.getTime() - targetMs);
  const diffMs = reminderTime.getTime() - now.getTime();

  return diffMs <= 0 && diffMs > -35 * 60 * 1000;
}

function reminderBody(row: InspectionRow, kind: ReminderKind) {
  const address = getAddress(row);
  const client = getClient(row);

  if (kind === "24h") {
    return `Reminder: inspection tomorrow at ${address}${client ? ` for ${client}` : ""}.`;
  }

  return `Reminder: inspection in about 2 hours at ${address}${client ? ` for ${client}` : ""}.`;
}

function reminderTitle(kind: ReminderKind) {
  return kind === "24h"
    ? "Inspection Tomorrow"
    : "Inspection Soon";
}

function getTargetUrl(row: InspectionRow) {
  const id = row.id;

  return id ? `/reports/${id}` : "/schedule";
}

async function alreadySent(admin: any, inspectionId: string, kind: ReminderKind) {
  const { data, error } = await admin
    .from("schedule_reminder_logs")
    .select("id")
    .eq("inspection_id", inspectionId)
    .eq("reminder_type", kind)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function markSent(
  admin: any,
  row: InspectionRow,
  kind: ReminderKind,
  sent: number,
  failed: number
) {
  const inspectionStart = getInspectionStart(row);

  await admin.from("schedule_reminder_logs").insert({
    inspection_id: String(row.id),
    reminder_type: kind,
    scheduled_for: inspectionStart?.toISOString() || null,
    sent_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: failed,
    metadata: {
      address: getAddress(row),
      client: getClient(row),
      status: row.status || row.inspection_status || null,
    },
  });
}

function tokenMatchesInspection(row: any, ids: Set<string>, emails: Set<string>) {
  const rowUserId = String(row?.user_id || "");
  const rowEmail = String(row?.user_email || "").toLowerCase();

  if (ids.size === 0 && emails.size === 0) {
    return false;
  }

  return (
    Boolean(rowUserId && ids.has(rowUserId)) ||
    Boolean(rowEmail && emails.has(rowEmail))
  );
}

async function sendReminderForInspection(
  admin: any,
  row: InspectionRow,
  kind: ReminderKind
) {
  const ids = new Set(getInspectionOwnerIds(row));
  const emails = new Set(getInspectionEmails(row));

  const payload: PushPayload = {
    title: reminderTitle(kind),
    body: reminderBody(row, kind),
    url: getTargetUrl(row),
    eventType: `schedule_reminder_${kind}`,
  };

  const { data: webRows } = await admin
    .from("app_push_subscriptions")
    .select("*")
    .eq("enabled", true);

  const { data: nativeRows } = await admin
    .from("app_native_push_tokens")
    .select("*")
    .eq("enabled", true);

  const webTargets = (webRows || []).filter((device: any) =>
    tokenMatchesInspection(device, ids, emails)
  );

  const nativeTargets = (nativeRows || []).filter((device: any) =>
    tokenMatchesInspection(device, ids, emails)
  );

  let sent = 0;
  let failed = 0;

  for (const device of webTargets) {
    try {
      await sendWebPush(device.subscription, payload);
      sent += 1;
    } catch (error: any) {
      failed += 1;

      if (isExpiredWebPush(error)) {
        await admin
          .from("app_push_subscriptions")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
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

      if (shouldDisableNativeToken(error)) {
        await admin
          .from("app_native_push_tokens")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("token", device.token);
      }
    }
  }

  await markSent(admin, row, kind, sent, failed);

  return {
    inspectionId: row.id,
    kind,
    sent,
    failed,
    webTargets: webTargets.length,
    nativeTargets: nativeTargets.length,
  };
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";

  return (
    authHeader === `Bearer ${secret}` ||
    cronHeader === secret
  );
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();

    const lookAhead = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const lookBack = new Date(now.getTime() - 60 * 60 * 1000);

    const { data: inspections, error } = await admin
      .from("inspections")
      .select("*")
      .gte("created_at", "2000-01-01T00:00:00.000Z")
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates = (inspections || []).filter((row: InspectionRow) => {
      if (!row.id || isCancelledOrComplete(row)) return false;

      const start = getInspectionStart(row);

      if (!start) return false;

      return start >= lookBack && start <= lookAhead;
    });

    const results: any[] = [];

    for (const row of candidates) {
      const start = getInspectionStart(row);

      if (!start) continue;

      for (const kind of ["24h", "2h"] as ReminderKind[]) {
        if (!inReminderWindow(start, now, kind)) {
          continue;
        }

        const sent = await alreadySent(admin, String(row.id), kind);

        if (sent) {
          continue;
        }

        const result = await sendReminderForInspection(admin, row, kind);
        results.push(result);
      }
    }

    return NextResponse.json({
      ok: true,
      checked: candidates.length,
      sent: results.reduce((sum, result) => sum + Number(result.sent || 0), 0),
      failed: results.reduce((sum, result) => sum + Number(result.failed || 0), 0),
      results,
    });
  } catch (error: any) {
    console.error("Schedule reminder cron error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Schedule reminder cron failed.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
