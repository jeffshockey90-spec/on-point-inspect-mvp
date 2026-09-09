import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { createThread, addMessage, setStatus, listThreads, triggerGpt, triggerClaude, stripLabel, buildThreadHistory, getPresence, postSystem } from "../../../../../lib/jarvis/threads";
import { jarvisRespond } from "../../../../../lib/jarvis/agent";
import { DEFAULT_TIME_ZONE } from "../../../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // owner replies run Jarvis inline (auto-reply)

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

// Jarvis auto-replies as a teammate: reads the whole thread and posts a
// 'jarvis' message. Used by the Ask-Jarvis button AND automatically after the
// owner posts or opens a thread, so the three of you converse without anyone
// pressing a button.
async function triggerJarvisReply(admin: any, threadId: string) {
  if (!threadId || !process.env.OPENAI_API_KEY) return;
  const { data: thread } = await admin.from("jarvis_threads").select("title, status").eq("id", threadId).maybeSingle();
  if (thread?.status === "closed") return; // stay quiet on closed threads
  const { data: msgs } = await admin
    .from("jarvis_messages").select("author, body, meta").eq("thread_id", threadId).order("created_at", { ascending: true });
  const history = buildThreadHistory(msgs || [], "jarvis");
  history.push({ role: "user", content: "Respond in this thread as Jarvis — a teammate to Jeff, Claude, and GPT. Read the whole thread (including any shared images) and reply to the latest message. Check anything factual with your tools first. Keep it tight; if there's genuinely nothing new to add, a short acknowledgement is fine." });
  const today = new Date().toISOString().slice(0, 10);
  const text = await jarvisRespond({
    admin, today, timeZone: DEFAULT_TIME_ZONE, history,
    extraSystem: `You are posting inside a work thread titled "${thread?.title || "(untitled)"}". Teammates: Jeff (owner), Claude (developer), GPT (strategist). Talk to them directly. Output ONLY your reply — do not prefix it with your name or a bracket label like [Jarvis].`,
  });
  const clean = stripLabel(text);
  if (clean) await addMessage(admin, { threadId, author: "jarvis", body: clean });
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const admin = getAdminClient();
  const { threads, error } = await listThreads(admin, { limit: 50 });
  if (error) return NextResponse.json({ error, threads: [] }, { status: 500 });
  const presence = await getPresence(admin);
  return NextResponse.json({ threads, presence });
}

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}) as any);
  const action = String(body.action || "").trim();
  const admin = getAdminClient();

  if (action === "reply") {
    const threadId = String(body.thread_id || "");
    const text = String(body.body || "");
    const meta = body.meta && typeof body.meta === "object" ? body.meta : undefined;
    const r = await addMessage(admin, { threadId, author: "owner", body: text || "(shared a file)", meta, status: body.status });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

    // Routing: a direct @tag talks to just that teammate; @team (or an untagged
    // post) brings everyone in. @gpt is auto-handled inside addMessage; @claude
    // and @team wake Claude via the watcher.
    const team = /@team\b/i.test(text);
    const hasGpt = /@gpt\b/i.test(text);
    const hasClaude = /@claude\b/i.test(text);
    const hasJarvis = /@jarvis\b/i.test(text);
    const directed = hasGpt || hasClaude || hasJarvis;
    const wantJarvis = team || hasJarvis || !directed;
    const wantGpt = (team || !directed) && !hasGpt; // @gpt already covered in addMessage
    const wantClaude = team || hasClaude; // cloud Claude (Anthropic API), always-on
    const jobs: Promise<any>[] = [];
    if (wantJarvis) jobs.push(triggerJarvisReply(admin, threadId));
    if (wantGpt) jobs.push(triggerGpt(admin, threadId));
    if (wantClaude) {
      jobs.push(triggerClaude(admin, threadId)); // cloud path (no-op without ANTHROPIC_API_KEY)
      // Honest fallback: if Claude is unreachable (watcher offline AND no cloud
      // key), say so instead of leaving the tag hanging.
      const pres = await getPresence(admin);
      if (!pres.claude.online) {
        jobs.push(postSystem(admin, threadId, "⚡ Claude isn't watching right now (his watcher is offline), so he won't auto-reply here. He'll pick this up in his next dev session — or start the watcher to bring him online."));
      }
    }
    if (jobs.length) await Promise.all(jobs);
    return NextResponse.json({ ok: true });
  }

  // "Ask GPT" button — bring ChatGPT (read-only strategist) into the thread.
  if (action === "gpt_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerGpt(admin, threadId);
    return NextResponse.json({ ok: true });
  }

  // "Ask Claude" button — bring cloud Claude (dev teammate) into the thread.
  if (action === "claude_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerClaude(admin, threadId);
    return NextResponse.json({ ok: true });
  }

  if (action === "status") {
    const r = await setStatus(admin, String(body.thread_id || ""), String(body.status || ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Bring Jarvis into a thread on demand (the Ask-Jarvis button).
  if (action === "jarvis_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerJarvisReply(admin, threadId);
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
    if (!r.id) return NextResponse.json({ error: r.error }, { status: 400 });
    await triggerJarvisReply(admin, r.id); // Jarvis engages the moment you open a thread
    return NextResponse.json({ ok: true, thread_id: r.id });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
