import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { sendPushNotification } from "../../../../../lib/push";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

async function requireOwner() {
  const userClient = await createUserClient();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;

  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

function cleanPreview(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 140);
}

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();

    if (!owner) {
      return NextResponse.json({ error: "Owner access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const inspectorId = String(body.inspectorId || "").trim();
    const message = String(body.message || "").trim();

    if (!inspectorId) {
      return NextResponse.json({ error: "Missing inspector." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: inspectorProfile, error: inspectorError } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", inspectorId)
      .maybeSingle();

    if (inspectorError || !inspectorProfile) {
      return NextResponse.json({ error: "Inspector not found." }, { status: 404 });
    }

    let { data: thread, error: threadLoadError } = await admin
      .from("inspector_support_threads")
      .select("*")
      .eq("inspector_id", inspectorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadLoadError) {
      return NextResponse.json({ error: threadLoadError.message }, { status: 500 });
    }

    const now = new Date().toISOString();

    if (!thread) {
      const { data: created, error: createError } = await admin
        .from("inspector_support_threads")
        .insert({
          inspector_id: inspectorId,
          inspector_email: inspectorProfile.email || null,
          inspector_name: inspectorProfile.full_name || inspectorProfile.email || "Inspector",
          status: "open",
          last_message: message,
          last_message_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      thread = created;
    }

    const { error: messageError } = await admin.from("inspector_support_messages").insert({
      thread_id: thread.id,
      sender_id: owner.id,
      sender_email: owner.email || null,
      sender_role: "owner",
      message,
      read_by_owner: true,
      read_by_inspector: false,
    });

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    const nextUnreadInspectorCount = Number(thread?.unread_inspector_count || 0) + 1;

    await admin
      .from("inspector_support_threads")
      .update({
        status: "open",
        last_message: message,
        last_message_at: now,
        updated_at: now,
        unread_inspector_count: nextUnreadInspectorCount,
      })
      .eq("id", thread.id);

    // Await so the inspector's push actually sends before the function returns.
    try {
      await sendPushNotification({
        title: "💬 Message from Jeff",
        body: cleanPreview(message),
        url: "/support",
        eventType: "support_reply",
        target: "user",
        targetUserId: inspectorId,
        targetUserEmail: inspectorProfile.email || undefined,
      });
    } catch (error) {
      console.error("Owner-initiated support push failed:", error);
    }

    return NextResponse.json({ ok: true, threadId: thread.id });
  } catch (error: any) {
    console.error("Owner support start error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not start conversation." },
      { status: 500 }
    );
  }
}
