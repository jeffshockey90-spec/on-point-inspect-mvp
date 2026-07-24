import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";
import http2 from "http2";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  eventType: string;
};

export type PushTarget = "all" | "native" | "web" | "user" | "inspectors" | "users";

export function createPushAdminClient() {
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

function matchesTarget(row: any, targetUserId: string, targetUserEmail: string) {
  if (!targetUserId && !targetUserEmail) return true;

  const rowUserId = String(row?.user_id || "");
  const rowEmail = String(row?.user_email || "").toLowerCase();

  return (
    Boolean(targetUserId && rowUserId === targetUserId) ||
    Boolean(targetUserEmail && rowEmail === targetUserEmail)
  );
}

function getRole(row: any) {
  return String(row?.role || row?.account_type || row?.user_role || (row?.inspector_id ? "inspector" : "") || "").toLowerCase();
}
function getUserId(row: any) { return String(row?.id || row?.user_id || row?.auth_user_id || row?.inspector_id || ""); }
function getEmail(row: any) { return String(row?.email || row?.user_email || row?.owner_email || row?.auth_email || "").toLowerCase(); }
async function getInspectorTargetSets(admin: any) {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const table of ["profiles", "company_users", "inspector_profiles"]) {
    try {
      const { data } = await admin.from(table).select("*");
      (data || []).forEach((row: any) => {
        const isInspector = getRole(row).includes("inspector") || row?.is_inspector === true || row?.inspector === true || Boolean(row?.inspector_id);
        if (!isInspector) return;
        const id = getUserId(row); const email = getEmail(row);
        if (id) ids.add(id); if (email) emails.add(email);
      });
    } catch {}
  }
  try { const { data } = await admin.from("inspections").select("inspector_id,user_id"); (data || []).forEach((row: any) => { const id = String(row?.inspector_id || row?.user_id || ""); if (id) ids.add(id); }); } catch {}
  return { ids, emails };
}
function matchesGroup(row: any, ids: Set<string>, emails: Set<string>, mode: "inspectors" | "users") {
  const rowUserId = String(row?.user_id || "");
  const rowEmail = String(row?.user_email || "").toLowerCase();
  const isInspector = Boolean(rowUserId && ids.has(rowUserId)) || Boolean(rowEmail && emails.has(rowEmail));
  return mode === "inspectors" ? isInspector : !isInspector;
}

async function trackPushEvent(admin: any, data: any) {
  try {
    await admin.from("app_device_events").insert({
      event_type: data.event_type || "owner_push_sent",
      path: data.path || "/api/push/send",
      device_id: data.device_id || "owner_push",
      user_agent: data.user_agent || null,
      platform: data.platform || "server",
      standalone: true,
      metadata: data.metadata || {},
    });
  } catch (error) {
    console.error("Push analytics tracking failed:", error);
  }
}

export type SendPushOptions = {
  title: string;
  body: string;
  url: string;
  eventType: string;
  target?: PushTarget;
  targetUserId?: string;
  targetUserEmail?: string;
  ownerEmail?: string | null;
};

export async function sendPushNotification(options: SendPushOptions) {
  const target = options.target || "all";
  const targetUserId = options.targetUserId || "";
  const targetUserEmail = (options.targetUserEmail || "").toLowerCase();

  const payload: PushPayload = {
    title: options.title,
    body: options.body,
    url: options.url,
    eventType: options.eventType,
  };

  const admin = createPushAdminClient();

  const { data: webRows, error: webError } = await admin
    .from("app_push_subscriptions")
    .select("*")
    .eq("enabled", true);

  const { data: nativeRows, error: nativeError } = await admin
    .from("app_native_push_tokens")
    .select("*")
    .eq("enabled", true);

  if (webError) {
    console.error("Web push lookup error:", webError);
  }

  if (nativeError) {
    console.error("Native push lookup error:", nativeError);
  }

  const groupTargets =
    target === "inspectors" || target === "users"
      ? await getInspectorTargetSets(admin)
      : { ids: new Set<string>(), emails: new Set<string>() };

  const webSubscriptions = (webRows || []).filter((row: any) => {
    if (target === "native") return false;
    if (target === "inspectors" || target === "users") {
      return matchesGroup(row, groupTargets.ids, groupTargets.emails, target);
    }
    return matchesTarget(row, targetUserId, targetUserEmail);
  });

  const nativeTokens = (nativeRows || []).filter((row: any) => {
    if (target === "web") return false;
    if (target === "inspectors" || target === "users") {
      return matchesGroup(row, groupTargets.ids, groupTargets.emails, target);
    }
    return matchesTarget(row, targetUserId, targetUserEmail);
  });

  let webSent = 0;
  let nativeSent = 0;
  let failed = 0;
  const failures: any[] = [];

  for (const row of webSubscriptions) {
    try {
      await sendWebPush(row.subscription, payload);
      webSent += 1;
    } catch (error: any) {
      failed += 1;
      failures.push({
        type: "web",
        endpoint: String(row?.endpoint || "").slice(0, 120),
        error: error?.message || "Web push failed.",
      });

      if (isExpiredWebPush(error)) {
        await admin
          .from("app_push_subscriptions")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("endpoint", row.endpoint);
      }
    }
  }

  for (const row of nativeTokens) {
    try {
      await sendNativeApns(row.token, payload);
      nativeSent += 1;
    } catch (error: any) {
      failed += 1;
      failures.push({
        type: "native",
        token: String(row?.token || "").slice(0, 18),
        error: error?.message || "Native push failed.",
      });

      if (shouldDisableNativeToken(error)) {
        await admin
          .from("app_native_push_tokens")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("token", row.token);
      }
    }
  }

  const sent = webSent + nativeSent;

  await trackPushEvent(admin, {
    event_type: "owner_push_sent",
    path: payload.url,
    device_id: "owner_push_broadcast",
    platform: "server",
    metadata: {
      owner_email: options.ownerEmail || null,
      target,
      target_user_id: targetUserId || null,
      target_user_email: targetUserEmail || null,
      title: payload.title,
      event_type: payload.eventType,
      web_targets: webSubscriptions.length,
      native_targets: nativeTokens.length,
      web_sent: webSent,
      native_sent: nativeSent,
      failed,
    },
  });

  return {
    sent,
    webSent,
    nativeSent,
    failed,
    webTargets: webSubscriptions.length,
    nativeTargets: nativeTokens.length,
    failures: failures.slice(0, 20),
  };
}
