import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import http2 from "http2";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

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
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function requireOwner() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;
  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getApnsPrivateKey() {
  return String(process.env.APPLE_APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
}

function createApnsJwt() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const privateKey = getApnsPrivateKey();

  if (!teamId || !keyId || !privateKey) throw new Error("Missing APNs credentials.");

  const encodedHeader = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const encodedPayload = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64Url(signature)}`;
}

async function sendNativeApns(token: string, payload: { title: string; body: string; url: string; eventType: string }) {
  const host = String(process.env.APPLE_APNS_USE_SANDBOX || "").toLowerCase() === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const topic = process.env.APPLE_BUNDLE_ID || process.env.NEXT_PUBLIC_IOS_BUNDLE_ID;
  if (!topic) throw new Error("Missing APNs topic.");

  const jwt = createApnsJwt();
  const apnsPayload = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    url: payload.url,
    eventType: payload.eventType,
  });

  return await new Promise<void>((resolve, reject) => {
    const client = http2.connect(host);
    client.on("error", reject);
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let responseBody = "";
    request.on("response", (headers) => { status = Number(headers[":status"] || 0); });
    request.setEncoding("utf8");
    request.on("data", (chunk) => { responseBody += chunk; });
    request.on("end", () => {
      try { client.close(); } catch {}
      if (status >= 200 && status < 300) resolve();
      else reject(new Error(responseBody || `APNs failed ${status}`));
    });
    request.on("error", reject);
    request.write(apnsPayload);
    request.end();
  });
}

async function sendInspectorPush(admin: any, inspectorId: string, inspectorEmail: string, message: string) {
  const payload = {
    title: "💬 Owner Reply",
    body: `Jeff replied: ${message.slice(0, 140)}`,
    url: "/support",
    eventType: "support_reply",
  };

  let webSent = 0;
  let nativeSent = 0;
  let failed = 0;

  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:jeff@onpointhomeinspect.com";

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const { data: webRows } = await admin
        .from("app_push_subscriptions")
        .select("*")
        .eq("enabled", true);

      for (const row of webRows || []) {
        const matches = String(row.user_id || "") === inspectorId || String(row.user_email || "").toLowerCase() === inspectorEmail.toLowerCase();
        if (!matches) continue;
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify(payload));
          webSent += 1;
        } catch (error: any) {
          failed += 1;
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await admin.from("app_push_subscriptions").update({ enabled: false }).eq("endpoint", row.endpoint);
          }
        }
      }
    }
  } catch (error) {
    console.error("Support web push failed:", error);
  }

  try {
    const { data: nativeRows } = await admin
      .from("app_native_push_tokens")
      .select("*")
      .eq("enabled", true);

    for (const row of nativeRows || []) {
      const matches = String(row.user_id || "") === inspectorId || String(row.user_email || "").toLowerCase() === inspectorEmail.toLowerCase();
      if (!matches) continue;
      try {
        await sendNativeApns(row.token, payload);
        nativeSent += 1;
      } catch (error) {
        failed += 1;
      }
    }
  } catch (error) {
    console.error("Support native push failed:", error);
  }

  try {
    await admin.from("app_notification_logs").insert({
      title: payload.title,
      body: payload.body,
      event_type: payload.eventType,
      target_url: payload.url,
      sent_count: webSent + nativeSent,
      failed_count: failed,
      metadata: { inspector_id: inspectorId, inspector_email: inspectorEmail, web_sent: webSent, native_sent: nativeSent },
    });
  } catch {}
}

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const threadId = String(body.threadId || "").trim();
    const message = String(body.message || "").trim();

    if (!threadId) return NextResponse.json({ error: "Missing thread ID." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    if (message.length > 4000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

    const admin = createAdminClient();
    const { data: thread, error: threadError } = await admin
      .from("inspector_support_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) return NextResponse.json({ error: threadError?.message || "Thread not found." }, { status: 404 });

    const { error: messageError } = await admin.from("inspector_support_messages").insert({
      thread_id: threadId,
      sender_id: owner.id,
      sender_email: owner.email || null,
      sender_role: "owner",
      message,
      read_by_owner: true,
      read_by_inspector: false,
    });

    if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });

    await admin
      .from("inspector_support_threads")
      .update({
        status: "open",
        last_message: message,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    await sendInspectorPush(admin, String(thread.inspector_id || ""), String(thread.inspector_email || ""), message);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not send reply." }, { status: 500 });
  }
}
