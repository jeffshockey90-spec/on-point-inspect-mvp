import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        success: true,
        unread_count: 0,
        unreadCount: 0,
      });
    }

    /*
      Compatibility route.

      Some client components still call /api/support/unread-count while the
      owner-side route is /api/owner/support/unread-count. Returning a safe
      count here prevents repeated 404s and keeps the UI fast.

      The queries below are intentionally defensive because older databases may
      not have every support-message column yet.
    */

    let unreadCount = 0;

    const directRecipientQuery = await supabase
      .from("inspector_support_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("read_at", null);

    if (!directRecipientQuery.error && typeof directRecipientQuery.count === "number") {
      unreadCount = directRecipientQuery.count;
    } else {
      const threadQuery = await supabase
        .from("inspector_support_threads")
        .select("id")
        .eq("inspector_id", user.id);

      const threadIds = (threadQuery.data || []).map((thread: any) => thread.id).filter(Boolean);

      if (!threadQuery.error && threadIds.length > 0) {
        const unreadMessageQuery = await supabase
          .from("inspector_support_messages")
          .select("id", { count: "exact", head: true })
          .in("thread_id", threadIds)
          .neq("sender_id", user.id)
          .is("read_at", null);

        if (!unreadMessageQuery.error && typeof unreadMessageQuery.count === "number") {
          unreadCount = unreadMessageQuery.count;
        }
      }
    }

    return NextResponse.json({
      success: true,
      unread_count: unreadCount,
      unreadCount,
    });
  } catch (error: any) {
    console.error("Support unread count compatibility route failed:", error);

    return NextResponse.json({
      success: true,
      unread_count: 0,
      unreadCount: 0,
    });
  }
}
