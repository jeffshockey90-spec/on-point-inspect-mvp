import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { DEFAULT_LAYOUT, normalizeLayout } from "../../../../lib/dashboard/dashboardLayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select("dashboard_layout")
    .eq("id", user.id)
    .maybeSingle();

  const layout = data?.dashboard_layout ? normalizeLayout(data.dashboard_layout) : DEFAULT_LAYOUT;
  return NextResponse.json({ layout });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // `reset: true` clears to defaults; otherwise normalize the submitted layout.
  const layout = body?.reset ? DEFAULT_LAYOUT : normalizeLayout(body?.layout);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, dashboard_layout: layout }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, layout });
}
