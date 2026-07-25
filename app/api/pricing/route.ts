import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { DEFAULT_PRICING_CONFIG, type InspectorPricingConfig } from "../../../lib/inspectorPricing";

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
        setAll() {},
      },
    },
  );
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data } = await supabase
    .from("inspector_pricing")
    .select("config")
    .eq("user_id", user.id)
    .maybeSingle();

  const config: InspectorPricingConfig =
    data?.config && Array.isArray(data.config.services) ? data.config : DEFAULT_PRICING_CONFIG;

  return NextResponse.json({ config, isDefault: !data?.config });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const config = body?.config;

  if (!config || !Array.isArray(config.services)) {
    return NextResponse.json({ error: "Invalid pricing config." }, { status: 400 });
  }

  const { error } = await supabase
    .from("inspector_pricing")
    .upsert(
      { user_id: user.id, config, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
