import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { sendPushNotification } from "../../../../../lib/push";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextVersionTitle(lastTitle: string | null | undefined) {
  const match = String(lastTitle || "").match(/(\d+)\.(\d+)\.(\d+)/);

  if (!match) return "update 1.0.0";

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;

  return `update ${major}.${minor}.${patch}`;
}

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

// Allow a trusted script (e.g. the post-changelog CLI run during a deploy) to
// publish an entry without an owner session, by presenting a shared secret.
function hasAnnounceToken(req: Request) {
  const secret = process.env.CHANGELOG_ANNOUNCE_TOKEN;
  if (!secret) return false;
  return (req.headers.get("x-announce-token") || "") === secret;
}

export async function POST(req: Request) {
  const owner = await requireOwner();

  if (!owner && !hasAnnounceToken(req)) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedTitle = String(body.title || "").trim();
  const entryBody = String(body.body || "").trim();
  const creditedUserName = body.creditedUserName ? String(body.creditedUserName).trim() : null;
  const featureRequestId = body.featureRequestId ? Number(body.featureRequestId) : null;

  if (!entryBody) {
    return NextResponse.json({ error: "Description is required." }, { status: 400 });
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

  // Leaving the title blank continues the owner's own "update x.y.z"
  // numbering from whichever entry was published most recently, instead of
  // requiring them to remember and type the next number by hand.
  let title = requestedTitle;

  if (!title) {
    const { data: lastEntry } = await admin
      .from("changelog_entries")
      .select("title")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    title = nextVersionTitle(lastEntry?.title);
  }

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

  // Await so the broadcast push actually sends before the function returns.
  try {
    await sendPushNotification({
      title: `🚀 What's New: ${title}`,
      body: entryBody.slice(0, 140),
      url: "/whats-new",
      eventType: "changelog_entry",
      target: "inspectors",
    });
  } catch (err) {
    console.error("Changelog push failed:", err);
  }

  return NextResponse.json({ ok: true, entry: data });
}
