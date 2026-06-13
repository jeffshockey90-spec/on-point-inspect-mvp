import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = [
  "jeffshockey90@gmail.com",
  "jeff@onpointhomeinspect.com",
];

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

async function sendWebPush(subscription: any, payload: any) {
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

    const admin = createAdminClient();

    const { data: subscriptions, error } = await admin
      .from("app_push_subscriptions")
      .select("*")
      .eq("enabled", true);

    if (error) {
      console.error("Push subscription load error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const row of subscriptions || []) {
      try {
        await sendWebPush(row.subscription, {
          title,
          body: message,
          url,
          eventType,
        });

        sent += 1;
      } catch (error: any) {
        failed += 1;

        console.error("Push send error:", error);

        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410
        ) {
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