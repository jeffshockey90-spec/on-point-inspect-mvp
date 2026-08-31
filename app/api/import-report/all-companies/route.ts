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

// Platform-owner ONLY: lists every company on the platform with its inspectors,
// so the super-admin can white-glove-import a report into any company/inspector
// when a new customer asks. Gated strictly to OWNER_EMAILS; anyone else gets 403.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = String(user?.email || "").toLowerCase();
  if (!user || !OWNER_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Platform owner only." }, { status: 403 });
  }

  const [{ data: companies }, { data: members }] = await Promise.all([
    admin.from("companies").select("id, name").order("name", { ascending: true }),
    admin.from("company_users").select("*"),
  ]);

  const membersByCompany = new Map<string, any[]>();
  for (const row of members || []) {
    const cid = String(row?.company_id || "");
    if (!cid) continue;
    if (!membersByCompany.has(cid)) membersByCompany.set(cid, []);
    membersByCompany.get(cid)!.push(row);
  }

  const result = (companies || []).map((company: any) => {
    const rows = membersByCompany.get(String(company.id)) || [];
    const ownerRow = rows.find((r: any) => String(r?.role || "") === "owner");
    const inspectors = rows
      .map((r: any) => ({
        id: String(r?.user_id || r?.id || ""),
        name: displayName(r),
        email: String(r?.email || r?.user_email || "").toLowerCase(),
        role: String(r?.role || "inspector"),
      }))
      .filter((r: any) => r.id)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return {
      id: String(company.id),
      name: String(company.name || "Unnamed company"),
      ownerId: String(ownerRow?.user_id || ownerRow?.id || inspectors[0]?.id || ""),
      inspectors,
    };
  });

  return NextResponse.json({ companies: result });
}
