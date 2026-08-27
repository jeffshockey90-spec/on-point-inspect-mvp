import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    },
  );
}

function admin(): any {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Report templates are company-shared and editable by any team member.
async function resolveCompanyId(db: any, userId: string): Promise<number | null> {
  const { data } = await db
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", userId)
    .not("company_id", "is", null);
  const rows = data || [];
  const owned = rows.find((r: any) => r.role === "owner");
  return (owned || rows[0])?.company_id ?? null;
}

function cleanSections(value: any): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const name = String(item || "").trim();
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); }
  }
  return out.slice(0, 60);
}

export async function GET() {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = admin();
  const companyId = await resolveCompanyId(db, user.id);
  if (!companyId) return NextResponse.json({ templates: [] });

  const { data } = await db
    .from("report_templates")
    .select("id, name, sections, service_key, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ templates: data || [] });
}

export async function POST(req: Request) {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = admin();
  const companyId = await resolveCompanyId(db, user.id);
  if (!companyId) return NextResponse.json({ error: "No company found for this account." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const sections = cleanSections(body?.sections);
  const serviceKey = body?.service_key ? String(body.service_key).trim() : null;
  if (!name) return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  if (sections.length === 0) return NextResponse.json({ error: "Add at least one section." }, { status: 400 });

  const row: Record<string, any> = {
    company_id: companyId,
    name,
    sections,
    service_key: serviceKey,
    updated_at: new Date().toISOString(),
  };

  // Update in place when an id is supplied (and it belongs to this company),
  // otherwise insert a new template.
  if (body?.id) {
    const { data, error } = await db
      .from("report_templates")
      .update(row)
      .eq("id", String(body.id))
      .eq("company_id", companyId)
      .select("id, name, sections, service_key, updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, template: data });
  }

  const { data, error } = await db
    .from("report_templates")
    .insert({ ...row, created_by: user.id })
    .select("id, name, sections, service_key, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(req: Request) {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = admin();
  const companyId = await resolveCompanyId(db, user.id);
  if (!companyId) return NextResponse.json({ error: "No company found." }, { status: 400 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { error } = await db.from("report_templates").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
