import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/apiAuth";
import { addMessage, setStatus, listThreads, recordHeartbeat } from "../../../../lib/jarvis/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Claude bridge. A Claude Code dev session authenticates with a shared
// secret (JARVIS_BRIDGE_TOKEN) to READ the work queue and POST progress back
// into a thread as the "claude" author — that's how Claude joins the 3-way
// conversation in FLOW without being a hosted service. Token-gated, not session
// -gated, so it works from a terminal. Never edits the app; only posts messages
// and moves thread status.
function authed(req: Request): boolean {
  const token = process.env.JARVIS_BRIDGE_TOKEN;
  if (!token) return false; // secure by default: no token configured = closed
  const provided = req.headers.get("x-jarvis-token") || req.headers.get("authorization") || "";
  return provided === token || provided === `Bearer ${token}`;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getAdminClient();
  const status = new URL(req.url).searchParams.get("status") || undefined;
  const { threads, error } = await listThreads(admin, { status, limit: 50 });
  if (error) return NextResponse.json({ error }, { status: 500 });
  // Default to the actionable queue when no status filter is given.
  const queue = status ? threads : threads.filter((t: any) => t.status === "open" || t.status === "in_progress");
  return NextResponse.json({ threads: queue });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json().catch(() => ({}) as any);
  const admin = getAdminClient();

  // Watcher heartbeat — keeps "Claude online" honest.
  if (body.action === "heartbeat") {
    await recordHeartbeat(admin, String(body.source || "watcher"));
    return NextResponse.json({ ok: true });
  }

  const threadId = String(body.thread_id || "").trim();

  if (body.action === "status") {
    const r = await setStatus(admin, threadId, String(body.status || ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  const r = await addMessage(admin, {
    threadId,
    author: "claude",
    body: String(body.body || ""),
    meta: body.meta || null,
    status: body.status, // optional: post + move status in one call
  });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
