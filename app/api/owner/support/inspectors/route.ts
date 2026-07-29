import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
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

async function requireOwner() {
  const userClient = await createUserClient();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;

  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

export async function GET() {
  const owner = await requireOwner();

  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const admin = createAdminClient();

  const [{ data: profiles, error: profilesError }, { data: companyUsers }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role").eq("role", "inspector"),
    admin.from("company_users").select("user_id, company_id, role"),
  ]);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const { data: companies } = await admin.from("companies").select("id, name");
  const companyNameById = new Map((companies || []).map((c: any) => [c.id, c.name]));
  const companyIdByUser = new Map((companyUsers || []).map((cu: any) => [cu.user_id, cu.company_id]));

  const inspectors = (profiles || [])
    .filter((p: any) => !OWNER_EMAILS.includes(String(p.email || "").toLowerCase()))
    .map((p: any) => ({
      id: p.id,
      name: p.full_name || p.email || "Inspector",
      email: p.email || null,
      companyName: companyNameById.get(companyIdByUser.get(p.id)) || null,
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return NextResponse.json({ inspectors });
}
