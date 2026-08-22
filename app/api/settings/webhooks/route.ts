import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateWebhookSecret, emitWebhook } from "../../../../lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}

function normalizeUrl(value: any) {
  const url = String(value || "").trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // The secret is shown so the subscriber can verify signatures.
  const { data } = await admin()
    .from("webhook_endpoints")
    .select("id, url, secret, events, enabled, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ endpoints: data || [] });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  // "test" action: fire a sample event to the user's endpoints so they can wire up.
  if (body?.action === "test") {
    await emitWebhook(admin(), {
      ownerUserId: user.id,
      event: "test.ping",
      data: { message: "Hello from FLOW", at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, tested: true });
  }

  const url = normalizeUrl(body?.url);
  if (!url) return NextResponse.json({ error: "A valid https URL is required." }, { status: 400 });

  const events = Array.isArray(body?.events)
    ? body.events.map((e: any) => String(e).trim()).filter(Boolean).slice(0, 20)
    : [];

  const { data, error } = await admin()
    .from("webhook_endpoints")
    .insert({ user_id: user.id, url, secret: generateWebhookSecret(), events })
    .select("id, url, secret, events, enabled, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, endpoint: data });
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { error } = await admin()
    .from("webhook_endpoints")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
