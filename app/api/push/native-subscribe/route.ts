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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const token = String(body.token || "").trim();
    const platform = String(body.platform || "ios").trim().toLowerCase();
    const userAgent = String(body.userAgent || "").trim();
    const timezone = String(body.timezone || "").trim();

    if (!token) {
      return NextResponse.json(
        { error: "Missing native push token." },
        { status: 400 }
      );
    }

    const userClient = await createUserClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    const { error } = await admin.from("app_native_push_tokens").upsert(
      {
        user_id: user.id,
        user_email: user.email || null,
        token,
        platform,
        user_agent: userAgent || null,
        timezone: timezone || null,
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "token",
      }
    );

    if (error) {
      console.error("Native push token save error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Native push token saved.",
    });
  } catch (error: any) {
    console.error("Native push subscribe error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to save native push token." },
      { status: 500 }
    );
  }
}
