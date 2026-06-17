import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

export async function GET() {
  try {
    const owner = await requireOwner();
    if (!owner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

    const admin = createAdminClient();
    const { data: threads, error } = await admin
      .from("inspector_support_threads")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const threadIds = (threads || []).map((thread: any) => thread.id);
    let messages: any[] = [];

    if (threadIds.length > 0) {
      const { data: messageRows, error: messagesError } = await admin
        .from("inspector_support_messages")
        .select("*")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true });

      if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });
      messages = messageRows || [];
    }

    const fullThreads = (threads || []).map((thread: any) => ({
      ...thread,
      messages: messages.filter((message) => message.thread_id === thread.id),
    }));

    await admin
      .from("inspector_support_messages")
      .update({ read_by_owner: true })
      .eq("sender_role", "inspector");

    try {
      await admin
        .from("inspector_support_threads")
        .update({ unread_owner_count: 0, updated_at: new Date().toISOString() })
        .in("id", threadIds);
    } catch {}

    return NextResponse.json({ threads: fullThreads });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load owner support threads." }, { status: 500 });
  }
}
