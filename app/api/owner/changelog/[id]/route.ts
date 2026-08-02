import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const owner = await requireOwner();
  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) {
    return NextResponse.json({ error: "Invalid entry id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = {};

  if (body.title !== undefined) updates.title = String(body.title || "").trim();
  if (body.body !== undefined) {
    const text = String(body.body || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Description cannot be empty." }, { status: 400 });
    }
    updates.body = text;
  }
  if (body.creditedUserName !== undefined) {
    updates.credited_user_name = body.creditedUserName
      ? String(body.creditedUserName).trim()
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("changelog_entries")
    .update(updates)
    .eq("id", entryId)
    .select()
    .single();

  if (error) {
    console.error("Changelog update error:", error);
    return NextResponse.json({ error: error.message || "Could not update entry." }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const owner = await requireOwner();
  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) {
    return NextResponse.json({ error: "Invalid entry id." }, { status: 400 });
  }

  const { error } = await admin().from("changelog_entries").delete().eq("id", entryId);

  if (error) {
    console.error("Changelog delete error:", error);
    return NextResponse.json({ error: error.message || "Could not delete entry." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
