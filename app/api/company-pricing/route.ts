import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_PRICING_CONFIG,
  type InspectorPricingConfig,
} from "../../../lib/inspectorPricing";

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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// Resolve the caller's company + whether they own it. A user can only manage
// pricing for a company they're the owner of.
async function resolveCompany(supabase: any, userId: string) {
  const { data: memberships } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", userId)
    .not("company_id", "is", null);

  const rows = memberships || [];
  const owned = rows.find((row: any) => row.role === "owner");
  const primary = owned || rows[0] || null;

  return {
    // Keep the raw numeric company id (companies.id is bigint).
    companyId: primary?.company_id ?? null,
    isOwner: Boolean(owned),
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { companyId, isOwner } = await resolveCompany(supabase, user.id);

  if (!companyId) {
    return NextResponse.json({
      config: DEFAULT_PRICING_CONFIG,
      source: "default",
      isOwner,
      hasCompanySheet: false,
    });
  }

  const { data } = await supabase
    .from("company_pricing")
    .select("config")
    .eq("company_id", companyId)
    .maybeSingle();

  const hasCompanySheet =
    Boolean(data?.config) && Array.isArray(data?.config?.services);

  return NextResponse.json({
    config: hasCompanySheet ? data!.config : DEFAULT_PRICING_CONFIG,
    source: hasCompanySheet ? "company" : "default",
    isOwner,
    hasCompanySheet,
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { companyId, isOwner } = await resolveCompany(supabase, user.id);

  if (!companyId || !isOwner) {
    return NextResponse.json(
      { error: "Only the company owner can set company pricing." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const config = body?.config as InspectorPricingConfig | undefined;

  if (!config || !Array.isArray(config.services)) {
    return NextResponse.json({ error: "Invalid pricing config." }, { status: 400 });
  }

  const { error } = await supabase.from("company_pricing").upsert(
    {
      company_id: companyId,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
