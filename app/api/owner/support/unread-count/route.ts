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
      return NextResponse.json({ count: 0, role: "guest" });
    }

    const admin = createAdminClient();
    const email = String(user.email || "").toLowerCase();
    const isOwner = OWNER_EMAILS.includes(email);

    if (isOwner) {
      const { count, error } = await admin
        .from("inspector_support_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_role", "inspector")
        .eq("read_by_owner", false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ count: count || 0, role: "owner" });
    }

    const { data: threads, error: threadError } = await admin
      .from("inspector_support_threads")
      .select("id")
      .eq("inspector_id", user.id);

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 500 });
    }

    const threadIds = (threads || []).map((thread: any) => thread.id).filter(Boolean);

    if (threadIds.length === 0) {
      return NextResponse.json({ count: 0, role: "inspector" });
    }

    const { count, error } = await admin
      .from("inspector_support_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .eq("sender_role", "owner")
      .eq("read_by_inspector", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0, role: "inspector" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load unread support count." },
      { status: 500 }
    );
  }
}
