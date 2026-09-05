import { NextResponse } from "next/server";
import { getSessionUser, getAdminClient } from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  -> { unread: boolean }  — is there a changelog entry newer than the last
//         time this user opened What's New?
// POST -> marks What's New as seen (profiles.whats_new_seen_at = now).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ unread: false });

  const admin = getAdminClient();

  const { data: latest } = await admin
    .from("changelog_entries")
    .select("published_at, created_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestAt = (latest as any)?.published_at || (latest as any)?.created_at || null;
  if (!latestAt) return NextResponse.json({ unread: false });

  const { data: profile } = await admin
    .from("profiles")
    .select("whats_new_seen_at")
    .eq("id", user.id)
    .maybeSingle();

  const seenAt = (profile as any)?.whats_new_seen_at || null;
  // Unread if there's a changelog and the user has never opened it, or the
  // latest entry is newer than their last view.
  const unread = !seenAt || new Date(latestAt).getTime() > new Date(seenAt).getTime();

  return NextResponse.json({ unread });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = getAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ whats_new_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
