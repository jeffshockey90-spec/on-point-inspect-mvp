import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-inspector on/off switch for the Secure 24 referral offer. Default OFF --
// an inspector must deliberately turn it on before any client ever sees it.

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createAdminClient();
    const { data } = await admin
      .from("secure24_settings")
      .select("enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    // No row yet == off (opt-in).
    return NextResponse.json({ ok: true, enabled: data?.enabled === true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load setting." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled === true;

    const admin = createAdminClient();
    const { error } = await admin
      .from("secure24_settings")
      .upsert(
        {
          user_id: user.id,
          user_email: String(user.email || "").toLowerCase(),
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) throw error;

    return NextResponse.json({ ok: true, enabled });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save setting." },
      { status: 500 },
    );
  }
}
