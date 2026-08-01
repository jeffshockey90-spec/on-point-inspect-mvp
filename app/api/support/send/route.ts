import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { sendPushNotification } from "../../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



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

function cleanPreview(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 140);
}

// Notify every owner across BOTH web and native (iOS) devices. The previous
// implementation only sent web push, so owners who use the native app - with
// web subscriptions disabled - never got alerted to inspector messages.
async function sendOwnerPush(title: string, body: string, url: string) {
  await Promise.allSettled(
    OWNER_EMAILS.map((ownerEmail) =>
      sendPushNotification({
        title,
        body,
        url,
        eventType: "support_message",
        target: "user",
        targetUserEmail: ownerEmail,
      })
    )
  );
}

export async function POST(req: Request) {
  try {
    const userClient = await createUserClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    const admin = createAdminClient();

    let { data: thread, error: threadLoadError } = await admin
      .from("inspector_support_threads")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadLoadError) {
      return NextResponse.json({ error: threadLoadError.message }, { status: 500 });
    }

    const inspectorName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Inspector";

    if (!thread) {
      const { data: created, error: createError } = await admin
        .from("inspector_support_threads")
        .insert({
          inspector_id: user.id,
          inspector_email: user.email || null,
          inspector_name: inspectorName,
          status: "open",
          last_message: message,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      thread = created;
    }

    const { error: messageError } = await admin
      .from("inspector_support_messages")
      .insert({
        thread_id: thread.id,
        sender_id: user.id,
        sender_email: user.email || null,
        sender_role: "inspector",
        message,
        read_by_owner: false,
        read_by_inspector: true,
      });

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    const nextUnreadOwnerCount = Number(thread?.unread_owner_count || 0) + 1;

    await admin
      .from("inspector_support_threads")
      .update({
        status: "open",
        last_message: message,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        unread_owner_count: nextUnreadOwnerCount,
      })
      .eq("id", thread.id);

    const { data: messages } = await admin
      .from("inspector_support_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    await sendOwnerPush(
      "💬 New Inspector Message",
      `${inspectorName}: ${cleanPreview(message)}`,
      "/dashboard/owner/support"
    );

    return NextResponse.json({
      thread: {
        ...thread,
        last_message: message,
        last_message_at: new Date().toISOString(),
        messages: messages || [],
      },
    });
  } catch (error: any) {
    console.error("Support send error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not send support message." },
      { status: 500 }
    );
  }
}
