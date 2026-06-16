import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import http2 from "http2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = [
  "jeffshockey90@gmail.com",
  "jeff@onpointhomeinspect.com",
];

type PushPayload = {
  title: string;
  body: string;
  url: string;
  eventType: string;
};

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
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
  const topic = process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID;

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
  });
}

function shouldDisableNativeToken(error: any) {
  const statusCode = Number(error?.statusCode || 0);
  const body = String(error?.body || error?.message || "");

  return (
    statusCode === 400 && body.includes("BadDeviceToken")
  ) || statusCode === 410 || body.includes("Unregistered");
}

export async function POST(req: Request) {
  try {
    const userClient = await createUserClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const userEmail = String(user.email || "").toLowerCase();

    if (!OWNER_EMAILS.includes(userEmail)) {
      return NextResponse.json(
        { error: "Owner only." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const title = String(body.title || "On Point Inspect");
    const message = String(
      body.body || body.message || "New activity recorded."
    );
    const url = String(body.url || "/dashboard/owner");
    const eventType = String(
      body.eventType || body.event_type || "manual"
    );

    const targetUserId = String(body.targetUserId || body.user_id || "").trim();
    const targetUserEmail = String(body.targetUserEmail || body.user_email || "")
      .toLowerCase()
      .trim();

    const payload: PushPayload = {
      title,
      body: message,
      url,
      eventType,
    };

    const admin = createAdminClient();

    let webQuery = admin
      .from("app_push_subscriptions")
      .select("*")
      .eq("enabled", true);

    let nativeQuery = admin
      .from("app_native_push_tokens")
      .select("*")
      .eq("enabled", true);

    if (targetUserId) {
      webQuery = webQuery.eq("user_id", targetUserId);
      nativeQuery = nativeQuery.eq("user_id", targetUserId);
    }

    if (targetUserEmail) {
      webQuery = webQuery.eq("user_email", targetUserEmail);
      nativeQuery = nativeQuery.eq("user_email", targetUserEmail);
    }

    const [webResult, nativeResult] = await Promise.all([webQuery, nativeQuery]);

    if (webResult.error) {
      console.error("Push subscription load error:", webResult.error);

      return NextResponse.json(
        { error: webResult.error.message },
        { status: 500 }
      );
    }

    if (nativeResult.error) {
      console.error("Native push token load error:", nativeResult.error);

      return NextResponse.json(
        { error: nativeResult.error.message },
        { status: 500 }
      );
    }

    let webSent = 0;
    let webFailed = 0;
    let nativeSent = 0;
    let nativeFailed = 0;

    for (const row of webResult.data || []) {
      try {
        await sendWebPush(row.subscription, payload);
        webSent += 1;
      } catch (error: any) {
        webFailed += 1;
        console.error("Web push send error:", error);

        if (error?.statusCode === 404 || error?.statusCode === 410) {
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

    for (const row of nativeResult.data || []) {
      try {
        await sendNativeApns(row.token, payload);
        nativeSent += 1;
      } catch (error: any) {
        nativeFailed += 1;
        console.error("Native APNs send error:", error);

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
    const failed = webFailed + nativeFailed;

    await admin.from("app_notification_logs").insert({
      title,
      body: message,
      event_type: eventType,
      target_url: url,
      sent_count: sent,
      failed_count: failed,
      created_by: user.id,
    });

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      webSent,
      webFailed,
      nativeSent,
      nativeFailed,
    });
  } catch (error: any) {
    console.error("Push send route error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to send push notification.",
      },
      { status: 500 }
    );
  }
}
