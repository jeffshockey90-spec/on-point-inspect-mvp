import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import { getAsyncDraftGlobalEnabled, setAsyncDraftGlobalEnabled } from "../../../../lib/asyncDraftFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOwner(email: unknown) {
  return OWNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}

// Owner-only: read the global kill switch for the async-draft beta.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const global = await getAsyncDraftGlobalEnabled().catch(() => false);
  return NextResponse.json({ global });
}

// Owner-only: flip the global kill switch. OFF instantly disables the beta for
// everyone (no app release needed — iOS is a remote WebView).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);
  try {
    const global = await setAsyncDraftGlobalEnabled(enabled);
    return NextResponse.json({ ok: true, global });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update flag." }, { status: 500 });
  }
}
