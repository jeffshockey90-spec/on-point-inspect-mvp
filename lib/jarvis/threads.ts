// Shared operations on Jarvis collaboration threads. All take a service-role
// admin client; the caller is responsible for auth (owner session or the
// bridge token). Server-only.

import { sendPushNotification } from "../push";
import { OWNER_EMAILS } from "../ownerEmails";

export type ThreadAuthor = "jarvis" | "owner" | "claude" | "gpt" | "system";
export type ThreadStatus = "open" | "in_progress" | "shipped" | "closed";

const STATUSES: ThreadStatus[] = ["open", "in_progress", "shipped", "closed"];
const CLAUDE_PRESENCE_WINDOW_MS = 90 * 1000; // watcher heartbeats each ~30s poll

function authorLabel(a: string) {
  return a === "claude" ? "Claude" : a === "gpt" ? "GPT" : a === "jarvis" ? "Jarvis" : a === "system" ? "System" : "Jeff";
}

// The watcher calls this each poll so "Claude online" reflects it actually
// running. Jarvis/GPT are cloud-always-on and don't heartbeat.
export async function recordHeartbeat(admin: any, source = "watcher") {
  try {
    await admin.from("jarvis_presence").upsert(
      { participant: "claude", last_seen: new Date().toISOString(), source, updated_at: new Date().toISOString() },
      { onConflict: "participant" },
    );
  } catch { /* best-effort */ }
}

// Honest availability. Claude = online only while the watcher heartbeat is
// fresh; Jarvis/GPT answer server-side whenever tagged, so they're always on.
export async function getPresence(admin: any) {
  let claudeSeen: string | null = null;
  try {
    const { data } = await admin.from("jarvis_presence").select("last_seen").eq("participant", "claude").maybeSingle();
    claudeSeen = data?.last_seen || null;
  } catch { /* table may not exist yet */ }
  const watcherFresh = claudeSeen ? Date.now() - new Date(claudeSeen).getTime() < CLAUDE_PRESENCE_WINDOW_MS : false;
  const cloudClaude = Boolean(process.env.ANTHROPIC_API_KEY); // always-on cloud path
  return {
    jarvis: { online: true, cloud: true },
    gpt: { online: true, cloud: true },
    claude: { online: watcherFresh || cloudClaude, cloud: cloudClaude, watcher: watcherFresh, lastSeen: claudeSeen },
  };
}

// A system-authored status note (not any teammate pretending). Inserted raw so
// it doesn't push the owner or trigger other teammates.
export async function postSystem(admin: any, threadId: string, body: string) {
  try {
    await admin.from("jarvis_messages").insert({ thread_id: threadId, author: "system", body });
    await admin.from("jarvis_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  } catch { /* best-effort */ }
}

// AI teammates sometimes echo the transcript's "[Name] " labeling into their own
// reply — strip a leading self-label so posts read clean.
export function stripLabel(text: string): string {
  return String(text || "").replace(/^\s*\[?(GPT|ChatGPT|Jarvis|Claude|Jeff)\]?:?\s*/i, "").trim();
}

// Build an OpenAI-style message history from thread messages, labeling other
// authors and attaching IMAGE attachments as image_url parts so the AI teammates
// can actually see screenshots/photos shared in the thread.
export function buildThreadHistory(msgs: any[], selfAuthor: string): { role: string; content: any }[] {
  return (msgs || []).map((m: any) => {
    const isSelf = m.author === selfAuthor;
    const prefix = isSelf ? "" : `[${authorLabel(m.author)}] `;
    const atts = Array.isArray(m?.meta?.attachments) ? m.meta.attachments : [];
    const images = atts.filter((a: any) => String(a?.type || "").startsWith("image/") && a?.url);
    const fileNote = atts.filter((a: any) => !String(a?.type || "").startsWith("image/")).map((a: any) => a.name).filter(Boolean);
    const text = `${prefix}${m.body || ""}${fileNote.length ? ` [attached files: ${fileNote.join(", ")}]` : ""}`;
    if (images.length && !isSelf) {
      return { role: "user", content: [{ type: "text", text }, ...images.map((a: any) => ({ type: "image_url", image_url: { url: a.url } }))] };
    }
    return { role: isSelf ? "assistant" : "user", content: text };
  });
}

// Push the owner whenever a teammate (Jarvis/Claude/GPT) posts (never for the
// owner's own messages). Best-effort — never blocks or throws.
async function notifyOwner(author: ThreadAuthor, title: string, text: string) {
  if (author === "owner" || author === "system") return;
  const who = author === "claude" ? "⚡ Claude" : author === "gpt" ? "💡 ChatGPT" : "🤖 Jarvis";
  const body = `${title ? `${title} — ` : ""}${String(text || "").replace(/\s+/g, " ").trim()}`.slice(0, 140);
  for (const email of OWNER_EMAILS) {
    try {
      await sendPushNotification({
        title: `${who} posted in Jarvis`,
        body,
        url: "/dashboard/owner/jarvis",
        eventType: "jarvis_thread",
        target: "user",
        targetUserEmail: email,
        ownerEmail: email,
      });
    } catch {
      /* best-effort */
    }
  }
}

// ChatGPT replies in a thread (read-only teammate). Unconditional — used by the
// "Ask GPT" button and by the @gpt auto-trigger below.
export async function triggerGpt(admin: any, threadId: string) {
  if (!threadId || !process.env.OPENAI_API_KEY) return;
  try {
    const { gptRespond } = await import("./agent");
    const { data: thread } = await admin.from("jarvis_threads").select("title, status").eq("id", threadId).maybeSingle();
    if (thread?.status === "closed") return;
    const { data: msgs } = await admin.from("jarvis_messages").select("author, body, meta").eq("thread_id", threadId).order("created_at", { ascending: true });
    const history = buildThreadHistory(msgs || [], "gpt");
    history.push({ role: "user", content: "Respond in this thread as GPT — the strategist teammate. Read the whole thread (including any shared images) and reply to the latest message. Stay in your lane (ideas, strategy, framing, second opinions), ground anything factual in your read-only tools, and talk to Jeff, Jarvis, and Claude directly. Keep it tight." });
    const today = new Date().toISOString().slice(0, 10);
    const text = await gptRespond({
      admin, today, timeZone: "America/New_York", history,
      extraSystem: `You are posting inside a work thread titled "${thread?.title || "(untitled)"}". Teammates: Jeff (owner), Jarvis (ops), Claude (dev). Output ONLY your reply — do not prefix it with your name or a bracket label like [GPT].`,
    });
    const clean = stripLabel(text);
    if (clean) await addMessage(admin, { threadId, author: "gpt", body: clean });
  } catch (e: any) {
    console.error("GPT trigger failed:", e?.message || e);
  }
}

// Auto-summon GPT when a message @gpt-tags it (from anyone but GPT itself).
async function maybeTriggerGpt(admin: any, threadId: string, author: ThreadAuthor, body: string) {
  if (author === "gpt") return;
  if (!/@gpt\b/i.test(String(body || ""))) return;
  await triggerGpt(admin, threadId);
}

// Cloud Claude — the conversational dev teammate, via the Anthropic API (like
// Jarvis/GPT use OpenAI). Always-on, no local watcher/CLI. Discusses, analyzes,
// and plans; the ACTUAL code changes happen in a real Claude Code session (with
// the repo) where Jeff confirms. No-ops if ANTHROPIC_API_KEY isn't set.
export async function triggerClaude(admin: any, threadId: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!threadId || !key) return;
  try {
    const { data: thread } = await admin.from("jarvis_threads").select("title, status").eq("id", threadId).maybeSingle();
    if (thread?.status === "closed") return;
    const { data: msgs } = await admin.from("jarvis_messages").select("author, body, meta").eq("thread_id", threadId).order("created_at", { ascending: true });
    const transcript = (msgs || [])
      .map((m: any) => {
        const files = Array.isArray(m?.meta?.attachments) ? m.meta.attachments.map((a: any) => a.name).filter(Boolean) : [];
        return `${authorLabel(m.author)}: ${m.body}${files.length ? ` [attached: ${files.join(", ")}]` : ""}`;
      })
      .join("\n\n");
    const system = `You are Claude, the developer on FLOW's private team — Jeff (owner), Jarvis (ops/health), GPT (strategist), and you (Claude, the builder). This is a work thread titled "${thread?.title || "(untitled)"}". Reply as a teammate: concise, warm, honest, in your dev lane. You discuss, analyze, and plan here; when something actually needs to be coded or shipped, say clearly what you'd do — the real change happens in a Claude Code session with the repo where Jeff confirms. Never claim you've edited code from this thread. Output only your reply, no name prefix.`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: `The thread so far:\n\n${transcript}\n\nWrite your next reply as Claude to the latest message.` }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("Claude API:", data?.error?.message || res.status); return; }
    const text = stripLabel(data?.content?.[0]?.text || "");
    if (text) await addMessage(admin, { threadId, author: "claude", body: text });
  } catch (e: any) {
    console.error("triggerClaude failed:", e?.message || e);
  }
}

export async function createThread(
  admin: any,
  input: { title: string; severity?: string; origin?: "jarvis" | "owner"; author: ThreadAuthor; body: string; meta?: any },
): Promise<{ id: string | null; error?: string }> {
  const title = String(input.title || "").trim().slice(0, 200);
  const body = String(input.body || "").trim();
  if (!title || !body) return { id: null, error: "Thread needs a title and an opening message." };
  const severity = ["info", "warning", "critical"].includes(String(input.severity)) ? input.severity : "warning";

  const { data: thread, error } = await admin
    .from("jarvis_threads")
    .insert({ title, severity, origin: input.origin || "jarvis", status: "open" })
    .select("id")
    .maybeSingle();
  if (error) return { id: null, error: error.message };

  const id = thread?.id;
  if (id) {
    await admin.from("jarvis_messages").insert({ thread_id: id, author: input.author, body, meta: input.meta || null });
    await notifyOwner(input.author, title, body);
    await maybeTriggerGpt(admin, id, input.author, body);
  }
  return { id: id || null };
}

export async function addMessage(
  admin: any,
  input: { threadId: string; author: ThreadAuthor; body: string; meta?: any; status?: string },
): Promise<{ ok: boolean; error?: string }> {
  const threadId = String(input.threadId || "").trim();
  const body = String(input.body || "").trim();
  if (!threadId || !body) return { ok: false, error: "Missing thread id or message." };

  const { error } = await admin
    .from("jarvis_messages")
    .insert({ thread_id: threadId, author: input.author, body, meta: input.meta || null });
  if (error) return { ok: false, error: error.message };

  const patch: any = { updated_at: new Date().toISOString() };
  if (input.status && STATUSES.includes(input.status as ThreadStatus)) patch.status = input.status;
  await admin.from("jarvis_threads").update(patch).eq("id", threadId);
  await notifyOwner(input.author, "", body);
  await maybeTriggerGpt(admin, threadId, input.author, body);
  return { ok: true };
}

export async function setStatus(admin: any, threadId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!STATUSES.includes(status as ThreadStatus)) return { ok: false, error: "Invalid status." };
  const { error } = await admin
    .from("jarvis_threads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", threadId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listThreads(
  admin: any,
  opts: { status?: string; limit?: number } = {},
): Promise<{ threads: any[]; error?: string }> {
  let q = admin
    .from("jarvis_threads")
    .select("id, title, status, severity, origin, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.min(opts.limit || 50, 100));
  if (opts.status) q = q.eq("status", opts.status);
  const { data: threads, error } = await q;
  if (error) return { threads: [], error: error.message };

  const ids = (threads || []).map((t: any) => t.id);
  let messages: any[] = [];
  if (ids.length) {
    const { data: msgs } = await admin
      .from("jarvis_messages")
      .select("id, thread_id, author, body, meta, created_at")
      .in("thread_id", ids)
      .order("created_at", { ascending: true });
    messages = msgs || [];
  }
  const byThread = new Map<string, any[]>();
  messages.forEach((m: any) => {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
    byThread.get(m.thread_id)!.push(m);
  });

  return { threads: (threads || []).map((t: any) => ({ ...t, messages: byThread.get(t.id) || [] })) };
}
