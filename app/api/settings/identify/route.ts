import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { getIdentifyGlobalEnabled } from "../../../../lib/identifyFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the inspector's own opt-in, the global kill-switch state, and the
// EFFECTIVE flag (global AND opt-in) the live camera uses to decide whether to
// show the point-and-identify control.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select("identify_enabled")
    .eq("id", user.id)
    .maybeSingle();

  const perUser = Boolean(data?.identify_enabled);
  let global = false;
  try {
    global = await getIdentifyGlobalEnabled();
  } catch {
    global = false;
  }

  return NextResponse.json({ enabled: global && perUser, perUser, global });
}

// Sets the inspector's own beta opt-in. (The global kill switch is owner-only,
// handled by /api/owner/identify.)
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, identify_enabled: enabled }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let global = false;
  try {
    global = await getIdentifyGlobalEnabled();
  } catch {
    global = false;
  }
  return NextResponse.json({ ok: true, perUser: enabled, global, enabled: global && enabled });
}
