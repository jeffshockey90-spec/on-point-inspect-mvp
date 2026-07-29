import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.userId || "").trim();

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing user." }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: callerMembership } = await admin
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerMembership?.company_id || callerMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the company owner can remove team members." },
        { status: 403 }
      );
    }

    const { data: targetMembership } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetMembership?.company_id !== callerMembership.company_id) {
      return NextResponse.json({ error: "That person isn't on your team." }, { status: 404 });
    }

    const { error } = await admin
      .from("company_users")
      .delete()
      .eq("user_id", targetUserId)
      .eq("company_id", callerMembership.company_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Remove inspector error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not remove team member." },
      { status: 500 }
    );
  }
}
