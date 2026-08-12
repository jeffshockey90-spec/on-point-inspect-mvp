import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_AI_WRITING_CONFIG,
  normalizeWritingConfig,
} from "../../../lib/ai/writingStyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sessionClient() {
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
              cookieStore.set(name, value, options),
            );
          } catch {}
        },
      },
    },
  );
}

function adminClient(): any {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Resolve the caller's company + whether they own it (service role, so it is
// unaffected by RLS). Only the owner may edit company-wide AI settings.
async function resolveCompany(admin: any, userId: string) {
  const { data: memberships } = await admin
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", userId)
    .not("company_id", "is", null);

  const rows = memberships || [];
  const owned = rows.find((r: any) => r.role === "owner");
  const primary = owned || rows[0] || null;

  return {
    companyId: primary?.company_id ?? null,
    isOwner: Boolean(owned),
  };
}

export async function GET() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = adminClient();
  const { companyId, isOwner } = await resolveCompany(admin, user.id);

  if (!companyId) {
    return NextResponse.json({
      config: DEFAULT_AI_WRITING_CONFIG,
      source: "default",
      isOwner,
    });
  }

  const { data } = await admin
    .from("company_ai_writing_settings")
    .select("config")
    .eq("company_id", companyId)
    .maybeSingle();

  const hasSaved = Boolean(data?.config && Object.keys(data.config).length);

  return NextResponse.json({
    config: hasSaved ? normalizeWritingConfig(data!.config) : DEFAULT_AI_WRITING_CONFIG,
    source: hasSaved ? "company" : "default",
    isOwner,
  });
}

export async function POST(req: Request) {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = adminClient();
  const { companyId, isOwner } = await resolveCompany(admin, user.id);

  if (!companyId || !isOwner) {
    return NextResponse.json(
      { error: "Only the company owner can change AI writing settings." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  // Normalize defensively so we never persist a malformed/partial object.
  const config = normalizeWritingConfig(body?.config);

  const { error } = await admin.from("company_ai_writing_settings").upsert(
    {
      company_id: companyId,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config });
}
