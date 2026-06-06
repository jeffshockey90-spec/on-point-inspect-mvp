import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Server environment variables are missing." },
        { status: 500 }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unable to verify user." },
        { status: 401 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const userId = user.id;
    const deletedAt = new Date().toISOString();

    const { data: companyUser } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (companyUser?.company_id) {
      await admin
        .from("companies")
        .update({
          deletion_requested_at: deletedAt,
          deleted_at: deletedAt,
          is_active: false,
        })
        .eq("id", companyUser.company_id);
    }

    await admin
      .from("profiles")
      .update({
        deletion_requested_at: deletedAt,
        deleted_at: deletedAt,
        is_active: false,
      })
      .eq("id", userId);

    await admin.auth.admin.deleteUser(userId);

    return NextResponse.json({
      success: true,
      message: "Account deletion completed.",
    });
  } catch (error) {
    console.error("Delete account error:", error);

    return NextResponse.json(
      { error: "Unable to delete account." },
      { status: 500 }
    );
  }
}