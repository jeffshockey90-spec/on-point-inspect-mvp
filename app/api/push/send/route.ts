import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sendPushNotification, type PushTarget } from "../../../../lib/push";

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

function cleanString(value: any, fallback: string, maxLength: number) {
  const clean = String(value || fallback).trim();
  return clean.slice(0, maxLength);
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
      return NextResponse.json({ error: "Owner only." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const title = cleanString(body.title, "FLOW", 120);
    const message = cleanString(
      body.body || body.message,
      "New activity recorded.",
      300
    );
    const url = cleanString(body.url, "/dashboard/owner", 500);
    const eventType = cleanString(
      body.eventType || body.event_type,
      "manual",
      80
    );
    const target = cleanString(body.target, "all", 40) as PushTarget;
    const targetUserId = cleanString(
      body.targetUserId || body.user_id,
      "",
      160
    );
    const targetUserEmail = cleanString(
      body.targetUserEmail || body.user_email,
      "",
      254
    ).toLowerCase();

    const result = await sendPushNotification({
      title,
      body: message,
      url,
      eventType,
      target,
      targetUserId,
      targetUserEmail,
      ownerEmail: user.email || null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Push send route error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to send push notification." },
      { status: 500 }
    );
  }
}
