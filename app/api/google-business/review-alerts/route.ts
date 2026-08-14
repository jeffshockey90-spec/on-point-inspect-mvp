import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: Request) {
  try {
    const { enabled } = await req.json().catch(() => ({}));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: companyUser } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyUser?.company_id) {
      return NextResponse.json({ error: "Company not found." }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("companies")
      .update({ google_review_alerts_enabled: Boolean(enabled) })
      .eq("id", companyUser.company_id);

    if (error) throw error;

    return NextResponse.json({ ok: true, enabled: Boolean(enabled) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to update review alerts." },
      { status: 500 }
    );
  }
}
