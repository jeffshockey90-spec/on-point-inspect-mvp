import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { createThread, addMessage, setStatus, listThreads } from "../../../../../lib/jarvis/threads";
import { jarvisRespond } from "../../../../../lib/jarvis/agent";
import { DEFAULT_TIME_ZONE } from "../../../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = String(user?.email || "").toLowerCase();
    if (user && OWNER_EMAILS.includes(email)) return user;
  } catch {
    /* fall through */
  }
  return null;
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const admin = getAdminClient();
  const { threads, error } = await listThreads(admin, { limit: 50 });
  if (error) return NextResponse.json({ error, threads: [] }, { status: 500 });
  return NextResponse.json({ threads });
}

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}) as any);
  const action = String(body.action || "").trim();
  const admin = getAdminClient();

  if (action === "reply") {
    const r = await addMessage(admin, {
      threadId: String(body.thread_id || ""),
      author: "owner",
      body: String(body.body || ""),
      status: body.status,
    });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (action === "status") {
    const r = await setStatus(admin, String(body.thread_id || ""), String(body.status || ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Bring Jarvis into a thread: he reads the whole conversation and replies as
  // a teammate (with live tool access), posting a 'jarvis' message.
  if (action === "jarvis_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    const { data: thread } = await admin.from("jarvis_threads").select("title").eq("id", threadId).maybeSingle();
    const { data: msgs } = await admin
      .from("jarvis_messages")
      .select("author, body")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    const history = (msgs || []).map((m: any) => ({
      role: m.author === "jarvis" ? "assistant" : "user",
      content: m.author === "jarvis" ? String(m.body) : `[${m.author === "claude" ? "Claude" : "Jeff"}] ${m.body}`,
    }));
    history.push({ role: "user", content: "Weigh in on this thread as Jarvis — read it and respond like a teammate to Jeff and Claude. Check anything factual with your tools first. Keep it tight and move it forward." });

    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    const today = new Date().toISOString().slice(0, 10);
    const text = await jarvisRespond({
      admin,
      today,
      timeZone: DEFAULT_TIME_ZONE,
      history,
      extraSystem: `You are posting inside a work thread titled "${thread?.title || "(untitled)"}". Your teammates here are Jeff (the owner) and Claude (the developer). Talk to them directly.`,
    });
    if (text) await addMessage(admin, { threadId, author: "jarvis", body: text });
    return NextResponse.json({ ok: true });
  }

  if (action === "create") {
    const r = await createThread(admin, {
      title: String(body.title || ""),
      severity: body.severity,
      origin: "owner",
      author: "owner",
      body: String(body.body || ""),
    });
    return r.id ? NextResponse.json({ ok: true, thread_id: r.id }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
