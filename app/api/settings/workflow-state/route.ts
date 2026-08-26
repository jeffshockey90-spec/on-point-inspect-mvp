import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user mirror of the small report-review workflow marks (section-review
// completion, Command Center reviewed-findings, per-finding quick status). The
// client keeps localStorage as the instant source and syncs here in the
// background (on load / page-hide), so these marks follow the user's devices.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select("workflow_state")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({ state: data?.workflow_state && typeof data.workflow_state === "object" ? data.workflow_state : {} });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const state = body?.state && typeof body.state === "object" ? body.state : {};

  // Cap the payload defensively so a runaway client can't bloat the row.
  const keys = Object.keys(state);
  if (keys.length > 500) return NextResponse.json({ error: "Too many keys." }, { status: 400 });

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, workflow_state: state }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
