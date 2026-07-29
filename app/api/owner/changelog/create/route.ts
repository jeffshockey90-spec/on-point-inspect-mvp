import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { sendPushNotification } from "../../../../../lib/push";
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
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return null;

  return OWNER_EMAILS.includes(String(user.email || "").toLowerCase()) ? user : null;
}

export async function POST(req: Request) {
  const owner = await requireOwner();

  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const entryBody = String(body.body || "").trim();
  const creditedUserName = body.creditedUserName ? String(body.creditedUserName).trim() : null;
  const featureRequestId = body.featureRequestId ? Number(body.featureRequestId) : null;

  if (!title || !entryBody) {
    return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } = await admin
    .from("changelog_entries")
    .insert({
      title,
      body: entryBody,
      credited_user_name: creditedUserName || null,
      feature_request_id: featureRequestId || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (featureRequestId) {
    await admin
      .from("feature_requests")
      .update({ status: "shipped", updated_at: new Date().toISOString() })
      .eq("id", featureRequestId);
  }

  sendPushNotification({
    title: `🚀 What's New: ${title}`,
    body: entryBody.slice(0, 140),
    url: "/whats-new",
    eventType: "changelog_entry",
    target: "inspectors",
  }).catch((err) => {
    console.error("Changelog push failed:", err);
  });

  return NextResponse.json({ ok: true, entry: data });
}
