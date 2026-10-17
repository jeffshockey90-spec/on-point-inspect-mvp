import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { createThread, addMessage, setStatus, listThreads, triggerGpt, triggerClaude, triggerJohnny5, triggerSupport, triggerHerald, stripLabel, buildThreadHistory, getPresence, postSystem } from "../../../../../lib/jarvis/threads";
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
    const hasJohnny = /@johnny5?\b/i.test(text);
    const hasSarah = /@(sarah|support)\b/i.test(text);
    const hasHerald = /@herald\b/i.test(text);
    const directed = hasGpt || hasClaude || hasJarvis || hasJohnny || hasSarah || hasHerald;
    const wantJarvis = team || hasJarvis || !directed;
    const wantGpt = (team || !directed) && !hasGpt; // @gpt already covered in addMessage
    const wantClaude = team || hasClaude; // cloud Claude (Anthropic API), always-on
    // Specialists (recon/support/marketing) join on @team; a direct tag is already
    // handled inside addMessage. They stay out of untagged chatter so every
    // message isn't answered by the whole team.
    const wantJohnny = team && !hasJohnny;
    const wantSupport = team && !hasSarah;
    const wantHerald = team && !hasHerald;
    const jobs: Promise<any>[] = [];
    if (wantJarvis) jobs.push(triggerJarvisReply(admin, threadId));
    if (wantGpt) jobs.push(triggerGpt(admin, threadId));
    if (wantJohnny) jobs.push(triggerJohnny5(admin, threadId));
    if (wantSupport) jobs.push(triggerSupport(admin, threadId));
    if (wantHerald) jobs.push(triggerHerald(admin, threadId));
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

  // "Ask Johnny 5" button — bring the competitive-recon teammate into the thread.
  if (action === "johnny5_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerJohnny5(admin, threadId);
    return NextResponse.json({ ok: true });
  }

  // "Ask Sarah" button — bring the support teammate into the thread.
  if (action === "support_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerSupport(admin, threadId);
    return NextResponse.json({ ok: true });
  }

  // "Ask Herald" button — bring the marketing teammate into the thread.
  if (action === "herald_reply") {
    const threadId = String(body.thread_id || "").trim();
    if (!threadId) return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
    await triggerHerald(admin, threadId);
    return NextResponse.json({ ok: true });
  }

  // APPROVE & SEND a support draft — owner-gated. Delivers Sarah's drafted reply
  // to the inspector via their support chat (same shape as the owner reply flow).
  if (action === "support_send") {
    const supportThreadId = String(body.support_thread_id || "").trim();
    const message = String(body.message || "").trim();
    if (!supportThreadId || !message) {
      return NextResponse.json({ error: "Missing support thread or message." }, { status: 400 });
    }
    const { data: thread } = await admin
      .from("inspector_support_threads")
      .select("*")
      .eq("id", supportThreadId)
      .maybeSingle();
    if (!thread) return NextResponse.json({ error: "Support thread not found." }, { status: 404 });
    const { error: msgErr } = await admin.from("inspector_support_messages").insert({
      thread_id: supportThreadId,
      sender_id: owner.id,
      sender_email: owner.email || null,
      sender_role: "owner",
      message,
      read_by_owner: true,
      read_by_inspector: false,
    });
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    await admin
      .from("inspector_support_threads")
      .update({
        status: "open",
        last_message: message.replace(/\s+/g, " ").trim().slice(0, 140),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        unread_inspector_count: Number(thread.unread_inspector_count || 0) + 1,
      })
      .eq("id", supportThreadId);
    return NextResponse.json({ ok: true, message: "Reply sent to the inspector." });
  }

  // APPROVE & PUBLISH a Herald post — owner-gated. Posts to the Facebook Page via
  // the Meta Graph API. Gated on the Page credentials; no-ops with a clear
  // message until they're set, so nothing can publish without them.
  if (action === "herald_publish") {
    const text = String(body.text || body.message || "").trim();
    const link = String(body.link || "").trim();
    if (!text) return NextResponse.json({ error: "Nothing to publish." }, { status: 400 });
    const pageId = process.env.META_PAGE_ID || process.env.FACEBOOK_PAGE_ID || "";
    const pageToken =
      process.env.META_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
    if (!pageId || !pageToken) {
      return NextResponse.json(
        {
          error:
            "Facebook isn't connected yet. Add META_PAGE_ID and META_PAGE_ACCESS_TOKEN (your Page's id + a Page access token) so Herald can publish approved posts.",
        },
        { status: 400 },
      );
    }
    try {
      const params = new URLSearchParams({ message: text, access_token: pageToken });
      if (link) params.set("link", link);
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`, {
        method: "POST",
        body: params,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json(
          { error: data?.error?.message || "Facebook publish failed." },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, post_id: data?.id || null, message: "Posted to your Facebook Page." });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Facebook publish failed." }, { status: 500 });
    }
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
