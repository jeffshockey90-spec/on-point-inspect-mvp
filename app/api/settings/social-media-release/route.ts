import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { DEFAULT_SOCIAL_MEDIA_RELEASE } from "../../../../lib/socialMediaRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Company-level social-media release: on/off + editable text. Owner edits it in
// Settings; default OFF. Clients only ever see the consent when it's enabled.

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function resolveContext() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner =
    membership?.role === "owner" || OWNER_EMAILS.includes(String(user.email || "").toLowerCase());
  return { admin, userId: user.id, companyId: membership?.company_id || null, isOwner };
}

export async function GET() {
  const ctx = await resolveContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let enabled = false;
  let text = "";
  if (ctx.companyId) {
    const { data } = await ctx.admin
      .from("companies")
      .select("social_media_release_enabled, social_media_release_text")
      .eq("id", ctx.companyId)
      .maybeSingle();
    enabled = data?.social_media_release_enabled === true;
    text = String(data?.social_media_release_text || "");
  }
  return NextResponse.json({
    ok: true,
    isOwner: ctx.isOwner,
    enabled,
    // Fall back to the default template so the editor is never blank.
    text: text || DEFAULT_SOCIAL_MEDIA_RELEASE,
    isUsingDefault: !text,
  });
}

export async function POST(req: Request) {
  const ctx = await resolveContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!ctx.isOwner || !ctx.companyId) {
    return NextResponse.json({ error: "Only the company owner can change this." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as any);
  const enabled = body?.enabled === true;
  const text = String(body?.text ?? "").trim();

  if (enabled && !text) {
    return NextResponse.json(
      { error: "Add the release text before turning this on." },
      { status: 400 },
    );
  }

  const { error } = await ctx.admin
    .from("companies")
    .update({
      social_media_release_enabled: enabled,
      social_media_release_text: text || null,
    })
    .eq("id", ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    enabled,
    text: text || DEFAULT_SOCIAL_MEDIA_RELEASE,
    isUsingDefault: !text,
  });
}
