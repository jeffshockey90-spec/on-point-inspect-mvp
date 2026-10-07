import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-inspector "always use the compass" preference for the live camera.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select("compass_auto_enable")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({ enabled: Boolean(data?.compass_auto_enable) });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, compass_auto_enable: enabled }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled });
}
