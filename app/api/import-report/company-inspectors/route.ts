import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function displayName(row: any) {
  return (
    String(row?.full_name || row?.name || row?.display_name || row?.email || row?.user_email || "").trim() ||
    "Inspector"
  );
}

// Owner-assisted import: returns the company roster so a company owner can pick
// which inspector an imported report should belong to. Non-owners get an empty
// list (they can only import into their own account). Reads via service-role so
// the owner can see teammates' rows regardless of the caller's row-level access.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ isOwner: false, inspectors: [] }, { status: 200 });
  }

  // The caller's own company_users row (readable under RLS) gives company + role.
  const { data: me } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .single();

  const email = String(user.email || "").toLowerCase();
  const isOwner = me?.role === "owner" || OWNER_EMAILS.includes(email);

  if (!isOwner || !me?.company_id) {
    return NextResponse.json({ isOwner: false, inspectors: [] });
  }

  // Full company roster via service-role.
  const { data: rows } = await admin
    .from("company_users")
    .select("*")
    .eq("company_id", me.company_id);

  const inspectors = (rows || [])
    .map((row: any) => ({
      id: String(row?.user_id || row?.id || ""),
      name: displayName(row),
      email: String(row?.email || row?.user_email || "").toLowerCase(),
      role: String(row?.role || "inspector"),
    }))
    .filter((r: any) => r.id)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return NextResponse.json({ isOwner: true, companyId: me.company_id, inspectors });
}
