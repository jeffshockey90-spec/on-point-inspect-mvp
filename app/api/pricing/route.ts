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

// Returns the EFFECTIVE pricing for the caller, resolving in order:
//   1. their personal inspector_pricing override
//   2. their company's owner-set company_pricing sheet
//   3. the platform default
// Quotes and New Inspection both read this, so the resolution is automatic.
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 1) Personal override.
  const { data: own } = await supabase
    .from("inspector_pricing")
    .select("config")
    .eq("user_id", user.id)
    .maybeSingle();

  if (own?.config && Array.isArray(own.config.services)) {
    return NextResponse.json({
      config: own.config as InspectorPricingConfig,
      source: "override",
      hasOverride: true,
      isDefault: false,
    });
  }

  // 2) Company sheet (owner-set default for the team).
  const { data: membership } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (membership?.company_id) {
    // Defensive: if company_pricing doesn't exist yet (migration not run),
    // this simply returns nothing and we fall through to the default.
    const { data: companySheet } = await supabase
      .from("company_pricing")
      .select("config")
      .eq("company_id", membership.company_id)
      .maybeSingle();

    if (companySheet?.config && Array.isArray(companySheet.config.services)) {
      return NextResponse.json({
        config: companySheet.config as InspectorPricingConfig,
        source: "company",
        hasOverride: false,
        isDefault: false,
      });
    }
  }

  // 3) Platform default.
  return NextResponse.json({
    config: DEFAULT_PRICING_CONFIG,
    source: "default",
    hasOverride: false,
    isDefault: true,
  });
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

// Remove the caller's personal override so their pricing reverts to the
// company sheet (or the platform default).
export async function DELETE() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { error } = await supabase
    .from("inspector_pricing")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
