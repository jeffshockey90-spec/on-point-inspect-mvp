import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerUser } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Coder chat's conversation + its in-flight task list, persisted per
// owner so a refresh, a closed tab, or switching devices doesn't lose the
// conversation or strand the answer to something still being looked into.
const MAX_BYTES = 2_000_000;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET() {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const { data, error } = await admin()
    .from("coder_conversations")
    .select("messages, pending")
    .eq("owner_id", owner.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data?.messages || [], pending: data?.pending || [] });
}

export async function PUT(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const pending = Array.isArray(body?.pending) ? body.pending : [];

  if (JSON.stringify({ messages, pending }).length > MAX_BYTES) {
    return NextResponse.json({ error: "Conversation is too large to save." }, { status: 400 });
  }

  const { error } = await admin()
    .from("coder_conversations")
    .upsert(
      { owner_id: owner.id, messages, pending, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
