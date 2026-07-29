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

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: callerMembership } = await admin
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!callerMembership?.company_id) {
    return NextResponse.json({ error: "No company found." }, { status: 404 });
  }

  const { data: members, error } = await admin
    .from("company_users")
    .select("id, user_id, role, created_at")
    .eq("company_id", callerMembership.company_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (members || []).map((m: any) => m.user_id);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));

  const team = (members || []).map((m: any) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    name: profileById.get(m.user_id)?.full_name || profileById.get(m.user_id)?.email || "Inspector",
    email: profileById.get(m.user_id)?.email || null,
    createdAt: m.created_at,
  }));

  return NextResponse.json({
    team,
    isOwner: callerMembership.role === "owner",
    currentUserId: user.id,
  });
}
