import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

export async function GET() {
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createAdminClient();

    let { data: thread, error: threadError } = await admin
      .from("inspector_support_threads")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 500 });
    }

    if (!thread) {
      const { data: created, error: createError } = await admin
        .from("inspector_support_threads")
        .insert({
          inspector_id: user.id,
          inspector_email: user.email || null,
          inspector_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Inspector",
          status: "open",
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      thread = created;
    }

    const { data: messages, error: messagesError } = await admin
      .from("inspector_support_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    await admin
      .from("inspector_support_messages")
      .update({ read_by_inspector: true })
      .eq("thread_id", thread.id)
      .eq("sender_role", "owner");

    return NextResponse.json({ thread: { ...thread, messages: messages || [] } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load support thread." }, { status: 500 });
  }
}
